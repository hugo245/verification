const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const axios = require('axios');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
});

const TOKEN = process.env.DISCORD_BOT_TOKEN || 'MTQ1MDgyNDcxNjE3NTgwMjQ2Mg.GrhScc.YqsPclTEsOUOJ6hb_kNmQAKM4DElEGw5OGEFK4';
const ROBLOX_GAME_LINK = process.env.ROBLOX_GAME_LINK || 'https://www.roblox.com/games/YOUR_GAME_ID/Your-Game-Name';
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || 'YOUR_VERIFIED_ROLE_ID';
const GUILD_ID = process.env.GUILD_ID || '1450577419357519902';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'MTQ.490238032cemerTM$IOIWN!!';
const RATE_LIMIT_ATTEMPTS = 500;
const CODE_EXPIRATION_MS = 5 * 60 * 1000;

let verifications = {};

client.once('ready', async () => {
    console.log('✅ Discord Bot is ready!');
    console.log(`📝 Logged in as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('verify').setDescription('Start Roblox verification'),
        new SlashCommandBuilder().setName('reset-verification').setDescription('Reset verification'),
        new SlashCommandBuilder().setName('verified-users').setDescription('List verified users').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('revoke-verification').setDescription('Revoke verification').addUserOption(opt => opt.setName('user').setDescription('User to revoke').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('force-verify').setDescription('Force verify a user').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)).addStringOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('verification-stats').setDescription('Server stats').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    ];

    await client.application.commands.set(commands);
    console.log('✅ Slash commands registered');
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const discordId = interaction.user.id;

    if (interaction.commandName === 'verify') {
        await interaction.deferReply({ ephemeral: true });

        if (verifications[discordId]?.status === 'verified') {
            return interaction.editReply({ content: '✅ Already verified.' });
        }

        const now = Date.now();
        const attempts = verifications[discordId]?.attempts || [];
        const recent = attempts.filter(ts => now - ts < 60*60*1000);
        if (recent.length >= RATE_LIMIT_ATTEMPTS) {
            return interaction.editReply({ content: '⚠️ Rate limit reached. Try again later.' });
        }

        const tempCode = Math.floor(100000 + Math.random() * 900000).toString();
        attempts.push(now);
        verifications[discordId] = { 
            tempCode, 
            codeTimestamp: now, 
            attempts, 
            status: 'pending', 
            robloxId: null, 
            robloxUsername: null 
        };

        console.log(`🔑 Generated code ${tempCode} for user ${interaction.user.tag} (${discordId})`);

        const embed = new EmbedBuilder()
            .setTitle('🎮 Roblox Verification')
            .setDescription(`**Follow these steps:**\n\n1️⃣ Join the Roblox game: [Click Here](${ROBLOX_GAME_LINK})\n2️⃣ Enter this code: **${tempCode}**\n\n⏱️ Code expires in 5 minutes`)
            .setColor(0xFFFF00)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setFooter({ text: 'Code is case-sensitive' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }

    if (interaction.commandName === 'reset-verification') {
        await interaction.deferReply({ ephemeral: true });
        if (verifications[discordId]) {
            delete verifications[discordId];
            console.log(`🔄 Reset verification for user ${interaction.user.tag} (${discordId})`);
            await interaction.editReply({ content: '✅ Reset complete. You can verify again.' });
        } else {
            await interaction.editReply({ content: '⚠️ No verification found.' });
        }
    }

    if (interaction.commandName === 'verified-users') {
        const list = Object.entries(verifications)
            .filter(([_, v]) => v.status === 'verified')
            .map(([id, v]) => `<@${id}> → **${v.robloxUsername || v.robloxId}**`)
            .join('\n') || 'None';
        await interaction.reply({ content: `**Verified Users:**\n${list}`, ephemeral: true });
    }

    if (interaction.commandName === 'revoke-verification') {
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser('user');
        if (verifications[user.id]?.status === 'verified') {
            delete verifications[user.id];
            console.log(`❌ Revoked verification for ${user.tag} (${user.id})`);
            
            try {
                const member = await interaction.guild.members.fetch(user.id);
                await member.roles.remove(VERIFIED_ROLE_ID);
            } catch (error) {
                console.error('Error removing role:', error);
            }
            
            await interaction.editReply({ content: `✅ Revoked verification for ${user.tag}.` });
        } else {
            await interaction.editReply({ content: '⚠️ User not verified.' });
        }
    }

    if (interaction.commandName === 'force-verify') {
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser('user');
        const robloxId = interaction.options.getString('robloxid');
        
        let robloxUsername = 'Unknown';
        try { 
            robloxUsername = (await axios.get(`https://users.roblox.com/v1/users/${robloxId}`)).data.name; 
        } catch (error) {
            console.error('Error fetching Roblox username:', error);
        }

        verifications[user.id] = { 
            status: 'verified', 
            robloxId, 
            robloxUsername, 
            verifiedTimestamp: Date.now() 
        };

        console.log(`⚡ Force verified ${user.tag} (${user.id}) as ${robloxUsername} (${robloxId})`);

        try {
            const member = await interaction.guild.members.fetch(user.id);
            await member.roles.add(VERIFIED_ROLE_ID);
        } catch (error) {
            console.error('Error adding role:', error);
        }

        await interaction.editReply({ content: `✅ Force verified ${user.tag} as **${robloxUsername}**` });
    }

    if (interaction.commandName === 'verification-stats') {
        const total = Object.keys(verifications).length;
        const verified = Object.values(verifications).filter(v => v.status === 'verified').length;
        const pending = total - verified;
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Verification Statistics')
            .addFields(
                { name: '📝 Total Records', value: `${total}`, inline: true },
                { name: '✅ Verified', value: `${verified}`, inline: true },
                { name: '⏳ Pending', value: `${pending}`, inline: true }
            )
            .setColor(0x00FF00)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.send('✅ Discord Verification Bot is running!');
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        bot: client.user ? client.user.tag : 'Not ready',
        verifications: Object.keys(verifications).length 
    });
});

app.post('/verify-webhook', async (req, res) => {
    const { secret, robloxId, enteredCode } = req.body;

    console.log("📥 Webhook received:", { robloxId, enteredCode: enteredCode ? '✓' : '✗' });

    if (secret !== WEBHOOK_SECRET) {
        console.log("❌ Secret mismatch!");
        console.log("Expected:", WEBHOOK_SECRET);
        console.log("Received:", secret);
        return res.status(401).send('Unauthorized');
    }

    const match = Object.entries(verifications).find(
        ([_, v]) => v.tempCode === enteredCode && v.status === 'pending'
    );
    
    if (!match) {
        console.log("❌ No matching code found for:", enteredCode);
        console.log("Available codes:", Object.values(verifications).filter(v => v.status === 'pending').map(v => v.tempCode));
        return res.status(400).send('Invalid or expired code');
    }

    const [discordId, record] = match;

    if (Date.now() - record.codeTimestamp > CODE_EXPIRATION_MS) {
        delete record.tempCode;
        console.log("⏰ Code expired for:", enteredCode);
        return res.status(400).send('Code expired');
    }

    let robloxUsername = 'Unknown';
    try { 
        robloxUsername = (await axios.get(`https://users.roblox.com/v1/users/${robloxId}`)).data.name; 
    } catch (error) {
        console.error('Error fetching Roblox username:', error);
    }

    record.status = 'verified';
    record.robloxId = robloxId;
    record.robloxUsername = robloxUsername;
    record.verifiedTimestamp = Date.now();
    delete record.tempCode;

    console.log(`✅ Verified user ${discordId} as ${robloxUsername} (${robloxId})`);

    const embed = new EmbedBuilder()
        .setTitle('✅ Roblox Verification Complete')
        .setDescription(`You've been verified as **${robloxUsername}**\nRoblox ID: ${robloxId}`)
        .setColor(0x00FF00)
        .setTimestamp();

    try {
        const user = await client.users.fetch(discordId);
        await user.send({ embeds: [embed] });
        console.log(`📧 Sent DM to ${user.tag}`);
    } catch (error) {
        console.error('Could not send DM:', error);
    }

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(discordId);
        await member.roles.add(VERIFIED_ROLE_ID);
        console.log(`🎭 Added verified role to ${member.user.tag}`);
    } catch (error) {
        console.error('Error adding role:', error);
    }

    res.send('Verified');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});

client.login(TOKEN);