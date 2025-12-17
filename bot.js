const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ComponentType } = require('discord.js');
const express = require('express');
const axios = require('axios');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
});

const TOKEN = process.env.DISCORD_BOT_TOKEN 
const ROBLOX_GAME_LINK = process.env.ROBLOX_GAME_LINK || 'https://www.roblox.com/games/YOUR_GAME_ID/Your-Game-Name';
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || 'YOUR_VERIFIED_ROLE_ID';
const GUILD_ID = process.env.GUILD_ID || '1450577419357519902';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET
const RATE_LIMIT_ATTEMPTS = 500;
const CODE_EXPIRATION_MS = 5 * 60 * 1000;

let verifications = {};

const colors = {
    primary: 0x5865F2,
    success: 0x57F287,
    warning: 0xFEE75C,
    error: 0xED4245,
    pending: 0x5865F2,
    verified: 0x57F287
};

const createInitialVerifyEmbed = (tempCode, userTag, userAvatar) => {
    return new EmbedBuilder()
        .setTitle('🎮 Roblox Verification Protocol')
        .setDescription('Welcome to the advanced verification system. Follow the steps below to link your Roblox account.')
        .addFields(
            {
                name: '📍 Step 1: Join the Game',
                value: `[Click here to join](${ROBLOX_GAME_LINK})`,
                inline: false
            },
            {
                name: '🔑 Step 2: Enter Your Code',
                value: `\`\`\`${tempCode}\`\`\`\nThis code is **case-sensitive** and valid for 5 minutes`,
                inline: false
            },
            {
                name: '⚡ Next Steps',
                value: 'Wait for the game to verify your account. You\'ll receive a confirmation once complete.',
                inline: false
            }
        )
        .setColor(colors.primary)
        .setThumbnail(userAvatar)
        .setAuthor({ name: userTag })
        .setFooter({ text: '⏱️ Expires in 5 minutes' })
        .setTimestamp();
};

const createPendingStatusEmbed = (tempCode) => {
    return new EmbedBuilder()
        .setTitle('⏳ Verification in Progress')
        .setDescription('Your verification is being processed. Here\'s your status:')
        .addFields(
            {
                name: '🔐 Your Code',
                value: `\`${tempCode}\``,
                inline: true
            },
            {
                name: '⏰ Time Remaining',
                value: '~5 minutes',
                inline: true
            },
            {
                name: '📊 Status',
                value: 'Waiting for game confirmation...',
                inline: false
            }
        )
        .setColor(colors.pending)
        .setFooter({ text: 'Please complete the steps above' })
        .setTimestamp();
};

const createVerificationCompleteEmbed = (robloxUsername, robloxId, verifiedAt) => {
    return new EmbedBuilder()
        .setTitle('✅ Verification Successful!')
        .setDescription('Your Roblox account has been verified and linked to your Discord.')
        .addFields(
            {
                name: '👤 Roblox Username',
                value: `**${robloxUsername}**`,
                inline: true
            },
            {
                name: '🆔 Roblox ID',
                value: `\`${robloxId}\``,
                inline: true
            },
            {
                name: '🎉 Verified At',
                value: `<t:${Math.floor(verifiedAt / 1000)}:F>`,
                inline: false
            },
            {
                name: '✨ Benefits',
                value: 'You now have access to verified-only channels and features!',
                inline: false
            }
        )
        .setColor(colors.success)
        .setFooter({ text: 'Welcome to the verified community!' })
        .setTimestamp();
};

const createAlreadyVerifiedEmbed = (robloxUsername, robloxId) => {
    return new EmbedBuilder()
        .setTitle('ℹ️ Already Verified')
        .setDescription('Your Discord account is already linked to a Roblox account.')
        .addFields(
            {
                name: '👤 Linked Account',
                value: `**${robloxUsername}** (\`${robloxId}\`)`,
                inline: true
            },
            {
                name: '🔄 Reset',
                value: 'Use `/reset-verification` if you need to unlink and reverify.',
                inline: false
            }
        )
        .setColor(colors.warning)
        .setFooter({ text: 'Contact staff if you need assistance' })
        .setTimestamp();
};

const createRateLimitEmbed = () => {
    return new EmbedBuilder()
        .setTitle('⚠️ Rate Limit Exceeded')
        .setDescription('You\'ve exceeded the maximum verification attempts.')
        .addFields(
            {
                name: '⏱️ Cooldown',
                value: 'Please wait 1 hour before attempting again.',
                inline: false
            },
            {
                name: '📞 Need Help?',
                value: 'Contact server staff if this is an error.',
                inline: false
            }
        )
        .setColor(colors.error)
        .setFooter({ text: 'Rate limit protection enabled' })
        .setTimestamp();
};

const createVerifiedUsersEmbed = (verifiedList) => {
    const list = verifiedList.length > 0 
        ? verifiedList.map(item => `${item.mention} → **${item.username}** (\`${item.robloxId}\`)`).join('\n')
        : '*No verified users yet*';
    
    return new EmbedBuilder()
        .setTitle('👥 Verified Users List')
        .setDescription(list)
        .setColor(colors.primary)
        .setFooter({ text: `Total: ${verifiedList.length} verified users` })
        .setTimestamp();
};

const createStatsEmbed = (total, verified, pending) => {
    const verificationRate = total > 0 ? ((verified / total) * 100).toFixed(1) : 0;
    
    return new EmbedBuilder()
        .setTitle('📊 Verification Statistics')
        .setDescription('Comprehensive overview of the verification system.')
        .addFields(
            {
                name: '📝 Total Records',
                value: `${total}`,
                inline: true
            },
            {
                name: '✅ Verified',
                value: `${verified}`,
                inline: true
            },
            {
                name: '⏳ Pending',
                value: `${pending}`,
                inline: true
            },
            {
                name: '📈 Verification Rate',
                value: `${verificationRate}%`,
                inline: true
            },
            {
                name: '🤖 Bot Status',
                value: '`Online & Operational`',
                inline: true
            },
            {
                name: '🕐 Last Updated',
                value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                inline: true
            }
        )
        .setColor(colors.success)
        .setFooter({ text: 'System Status: All Systems Operational' })
        .setTimestamp();
};

const createRevocationEmbed = (username, robloxId) => {
    return new EmbedBuilder()
        .setTitle('❌ Verification Revoked')
        .setDescription('User verification has been revoked.')
        .addFields(
            {
                name: '👤 Revoked Account',
                value: `**${username}** (\`${robloxId}\`)`,
                inline: true
            },
            {
                name: '🔐 Role Status',
                value: 'Verified role removed',
                inline: true
            }
        )
        .setColor(colors.error)
        .setFooter({ text: 'Action completed by admin' })
        .setTimestamp();
};

const createForceVerifyEmbed = (username, robloxId) => {
    return new EmbedBuilder()
        .setTitle('⚡ Force Verification Applied')
        .setDescription('User has been manually verified.')
        .addFields(
            {
                name: '👤 Roblox Account',
                value: `**${username}**`,
                inline: true
            },
            {
                name: '🆔 Roblox ID',
                value: `\`${robloxId}\``,
                inline: true
            },
            {
                name: '🎭 Role Status',
                value: 'Verified role assigned',
                inline: false
            }
        )
        .setColor(colors.success)
        .setFooter({ text: 'Manual verification completed' })
        .setTimestamp();
};

client.once('ready', async () => {
    console.log('✅ Discord Bot is ready!');
    console.log(`📝 Logged in as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('verify').setDescription('Start Roblox verification'),
        new SlashCommandBuilder().setName('reset-verification').setDescription('Reset your verification'),
        new SlashCommandBuilder().setName('verified-users').setDescription('List all verified users').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('revoke-verification').setDescription('Revoke user verification').addUserOption(opt => opt.setName('user').setDescription('User to revoke').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('force-verify').setDescription('Manually verify a user').addUserOption(opt => opt.setName('user').setDescription('User to verify').setRequired(true)).addStringOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('verification-stats').setDescription('View verification statistics').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
            const embed = createAlreadyVerifiedEmbed(verifications[discordId].robloxUsername, verifications[discordId].robloxId);
            return interaction.editReply({ embeds: [embed] });
        }

        const now = Date.now();
        const attempts = verifications[discordId]?.attempts || [];
        const recent = attempts.filter(ts => now - ts < 60*60*1000);
        if (recent.length >= RATE_LIMIT_ATTEMPTS) {
            const embed = createRateLimitEmbed();
            return interaction.editReply({ embeds: [embed] });
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

        const initialEmbed = createInitialVerifyEmbed(tempCode, interaction.user.tag, interaction.user.displayAvatarURL());
        const statusEmbed = createPendingStatusEmbed(tempCode);

        await interaction.editReply({ embeds: [initialEmbed, statusEmbed] });
    }

    if (interaction.commandName === 'reset-verification') {
        await interaction.deferReply({ ephemeral: true });
        if (verifications[discordId]) {
            const resetEmbed = new EmbedBuilder()
                .setTitle('🔄 Verification Reset')
                .setDescription('Your verification has been cleared. You can verify again.')
                .setColor(colors.warning)
                .setFooter({ text: 'Use /verify to start again' })
                .setTimestamp();
            delete verifications[discordId];
            console.log(`🔄 Reset verification for user ${interaction.user.tag} (${discordId})`);
            await interaction.editReply({ embeds: [resetEmbed] });
        } else {
            const noRecordEmbed = new EmbedBuilder()
                .setTitle('ℹ️ No Verification Found')
                .setDescription('You don\'t have an active verification to reset.')
                .setColor(colors.warning)
                .setFooter({ text: 'Use /verify to start verification' })
                .setTimestamp();
            await interaction.editReply({ embeds: [noRecordEmbed] });
        }
    }

    if (interaction.commandName === 'verified-users') {
        const verifiedList = Object.entries(verifications)
            .filter(([_, v]) => v.status === 'verified')
            .map(([id, v]) => ({
                mention: `<@${id}>`,
                username: v.robloxUsername || v.robloxId,
                robloxId: v.robloxId
            }));

        const embed = createVerifiedUsersEmbed(verifiedList);
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === 'revoke-verification') {
        await interaction.deferReply({ ephemeral: true });
        const user = interaction.options.getUser('user');
        if (verifications[user.id]?.status === 'verified') {
            const username = verifications[user.id].robloxUsername;
            const robloxId = verifications[user.id].robloxId;
            delete verifications[user.id];
            console.log(`❌ Revoked verification for ${user.tag} (${user.id})`);
            
            try {
                const member = await interaction.guild.members.fetch(user.id);
                await member.roles.remove(VERIFIED_ROLE_ID);
            } catch (error) {
                console.error('Error removing role:', error);
            }
            
            const embed = createRevocationEmbed(username, robloxId);
            await interaction.editReply({ embeds: [embed] });
        } else {
            const notVerifiedEmbed = new EmbedBuilder()
                .setTitle('ℹ️ User Not Verified')
                .setDescription(`${user.tag} is not verified yet.`)
                .setColor(colors.warning)
                .setFooter({ text: 'No action taken' })
                .setTimestamp();
            await interaction.editReply({ embeds: [notVerifiedEmbed] });
        }
    }

    if (interaction.commandName === 'force-verify') {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const user = interaction.options.getUser('user');
            const robloxId = interaction.options.getString('robloxid');
            
            let robloxUsername = 'Unknown';
            try { 
                const response = await Promise.race([
                    axios.get(`https://users.roblox.com/v1/users/${robloxId}`),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                ]);
                robloxUsername = response.data.name; 
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

            const embed = createForceVerifyEmbed(robloxUsername, robloxId);
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Force verify error:', error);
            await interaction.editReply({ content: '❌ An error occurred during verification.' });
        }
    }

    if (interaction.commandName === 'verification-stats') {
        const total = Object.keys(verifications).length;
        const verified = Object.values(verifications).filter(v => v.status === 'verified').length;
        const pending = total - verified;
        
        const embed = createStatsEmbed(total, verified, pending);
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
    try {
        const { secret, robloxId, enteredCode } = req.body;

        console.log("📥 Webhook received:", { robloxId, enteredCode: enteredCode ? '✓' : '✗' });

        if (secret !== WEBHOOK_SECRET) {
            console.log("❌ Secret mismatch!");
            return res.status(401).send('Unauthorized');
        }

        const match = Object.entries(verifications).find(
            ([_, v]) => v.tempCode === enteredCode && v.status === 'pending'
        );
        
        if (!match) {
            console.log("❌ No matching code found for:", enteredCode);
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
            const response = await Promise.race([
                axios.get(`https://users.roblox.com/v1/users/${robloxId}`),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]);
            robloxUsername = response.data.name; 
        } catch (error) {
            console.error('Error fetching Roblox username:', error);
        }

        record.status = 'verified';
        record.robloxId = robloxId;
        record.robloxUsername = robloxUsername;
        record.verifiedTimestamp = Date.now();
        delete record.tempCode;

        console.log(`✅ Verified user ${discordId} as ${robloxUsername} (${robloxId})`);

        const completionEmbed = createVerificationCompleteEmbed(robloxUsername, robloxId, Date.now());
        const successEmbed = new EmbedBuilder()
            .setTitle('🎊 Welcome to the Verified Community!')
            .setDescription('You\'ve successfully linked your Roblox account and unlocked new privileges.')
            .setColor(colors.success)
            .setFooter({ text: 'Enjoy exclusive perks!' })
            .setTimestamp();

        try {
            const user = await client.users.fetch(discordId);
            await user.send({ embeds: [completionEmbed, successEmbed] });
            console.log(`📧 Sent verification confirmation to ${user.tag}`);
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
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Internal server error');
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});

client.login(TOKEN);