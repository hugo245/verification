const { createClient } = require('@supabase/supabase-js');
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
const axios = require('axios');
const sharp = require('sharp');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
});

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const ROBLOX_GAME_LINK = process.env.ROBLOX_GAME_LINK || 'https://www.roblox.com/games/YOUR_GAME_ID/Your-Game-Name';
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || 'YOUR_VERIFIED_ROLE_ID';
const GUILD_ID = process.env.GUILD_ID || '1450577419357519902';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const RATE_LIMIT_ATTEMPTS = 500;
const CODE_EXPIRATION_MS = 5 * 60 * 1000;
const UNIVERSE_ID = process.env.UNIVERSE_ID || 'YOUR_UNIVERSE_ID';
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const DATASTORE_NAME = process.env.DATASTORE_NAME || 'Leaderboard';

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

let verifications = {};

// Test Supabase connection
const initializeDatabase = async () => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('count', { count: 'exact', head: true });
        
        if (error) throw error;
        console.log('✅ Connected to Supabase database');
    } catch (error) {
        console.error('❌ Supabase connection error:', error);
    }
};

const dbSaveVerification = async (discordId, discordTag, robloxId, robloxUsername, timestamp) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .upsert({
                discord_id: discordId,
                discord_tag: discordTag,
                roblox_id: robloxId,
                roblox_username: robloxUsername,
                verified_timestamp: timestamp
            }, { onConflict: 'discord_id' });
        
        if (error) throw error;
        console.log(`✅ Saved verification for ${discordId}`);
    } catch (error) {
        console.error('❌ Error saving verification:', error);
        throw error;
    }
};

const dbGetVerification = async (discordId) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('discord_id', discordId)
            .single();
        
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    } catch (error) {
        console.error('❌ Error fetching verification:', error);
        return null;
    }
};

const dbGetAllVerified = async () => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('verified_timestamp', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('❌ Error fetching all verified users:', error);
        return [];
    }
};

const dbDeleteVerification = async (discordId) => {
    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('discord_id', discordId);
        
        if (error) throw error;
        console.log(`✅ Deleted verification for ${discordId}`);
    } catch (error) {
        console.error('❌ Error deleting verification:', error);
        throw error;
    }
};

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
    
    await initializeDatabase();

    const commands = [
        new SlashCommandBuilder().setName('verify').setDescription('Start Roblox verification'),
        new SlashCommandBuilder().setName('reset-verification').setDescription('Reset your verification'),
        new SlashCommandBuilder().setName('verified-users').setDescription('List all verified users').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('revoke-verification').setDescription('Revoke user verification').addUserOption(opt => opt.setName('user').setDescription('User to revoke').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('force-verify').setDescription('Manually verify a user').addUserOption(opt => opt.setName('user').setDescription('User to verify').setRequired(true)).addStringOption(opt => opt.setName('robloxid').setDescription('Roblox ID').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('verification-stats').setDescription('View verification statistics').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        new SlashCommandBuilder().setName('leaderboard').setDescription('View the game leaderboard'),
    ];

    await client.application.commands.set(commands);
    console.log('✅ Slash commands registered');
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const discordId = interaction.user.id;

    if (interaction.commandName === 'verify') {
        await interaction.deferReply({ ephemeral: true });

        try {
            const dbUser = await dbGetVerification(discordId);
            if (dbUser) {
                const embed = createAlreadyVerifiedEmbed(dbUser.roblox_username, dbUser.roblox_id);
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
                robloxUsername: null,
                discordTag: interaction.user.tag,
                discordAvatar: interaction.user.displayAvatarURL({ format: 'png', size: 256 })
            };

            console.log(`🔑 Generated code ${tempCode} for user ${interaction.user.tag} (${discordId})`);

            const initialEmbed = createInitialVerifyEmbed(tempCode, interaction.user.tag, interaction.user.displayAvatarURL());
            const statusEmbed = createPendingStatusEmbed(tempCode);

            await interaction.editReply({ embeds: [initialEmbed, statusEmbed] });
        } catch (error) {
            console.error('Verify error:', error);
            await interaction.editReply({ content: '❌ An error occurred' });
        }
    }

    if (interaction.commandName === 'reset-verification') {
        await interaction.deferReply({ ephemeral: true });
        try {
            const dbUser = await dbGetVerification(discordId);
            if (dbUser || verifications[discordId]) {
                if (dbUser) {
                    await dbDeleteVerification(discordId);
                }
                if (verifications[discordId]) {
                    delete verifications[discordId];
                }

                const member = await interaction.guild.members.fetch(interaction.user.id);
                await member.roles.remove(VERIFIED_ROLE_ID).catch(console.error);

                const resetEmbed = new EmbedBuilder()
                    .setTitle('🔄 Verification Reset')
                    .setDescription('Your verification has been cleared. You can verify again.')
                    .setColor(colors.warning)
                    .setFooter({ text: 'Use /verify to start again' })
                    .setTimestamp();

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
        } catch (error) {
            console.error('Reset error:', error);
            await interaction.editReply({ content: '❌ An error occurred' });
        }
    }

    if (interaction.commandName === 'verified-users') {
        try {
            const allUsers = await dbGetAllVerified();
            const verifiedList = allUsers.map(user => ({
                mention: `<@${user.discord_id}>`,
                username: user.roblox_username,
                robloxId: user.roblox_id
            }));

            const embed = createVerifiedUsersEmbed(verifiedList);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('Error fetching verified users:', error);
            await interaction.reply({ content: '❌ Error fetching verified users', ephemeral: true });
        }
    }

    if (interaction.commandName === 'revoke-verification') {
        await interaction.deferReply({ ephemeral: true });
        try {
            const user = interaction.options.getUser('user');
            const userRecord = await dbGetVerification(user.id);
            
            if (userRecord) {
                await dbDeleteVerification(user.id);
                console.log(`❌ Revoked verification for ${user.tag} (${user.id})`);
                
                try {
                    const member = await interaction.guild.members.fetch(user.id);
                    await member.roles.remove(VERIFIED_ROLE_ID);
                } catch (error) {
                    console.error('Error removing role:', error);
                }
                
                const embed = createRevocationEmbed(userRecord.roblox_username, userRecord.roblox_id);
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
        } catch (error) {
            console.error('Revoke error:', error);
            await interaction.editReply({ content: '❌ An error occurred' });
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

            await dbSaveVerification(user.id, user.tag, robloxId, robloxUsername, Date.now());

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
        try {
            const allUsers = await dbGetAllVerified();
            const total = allUsers.length;
            const verified = allUsers.filter(u => u.verified_timestamp).length;
            const pending = 0;
            
            const embed = createStatsEmbed(total, verified, pending);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('Stats error:', error);
            await interaction.reply({ content: '❌ Error fetching statistics', ephemeral: true });
        }
    }

    if (interaction.commandName === 'leaderboard') {
        await interaction.deferReply({ ephemeral: true });

        if (!ROBLOX_API_KEY || !UNIVERSE_ID) {
            return interaction.editReply({ content: '❌ Leaderboard feature is not configured properly.' });
        }

        try {
            const response = await axios.get(
                `https://apis.roblox.com/ordered-data-stores/v1/universes/${UNIVERSE_ID}/orderedDatastores/${DATASTORE_NAME}/scopes/global/entries?limit=10&sortOrder=Descending`,
                { headers: { 'x-api-key': ROBLOX_API_KEY } }
            );

            const entries = response.data.entries;

            if (!entries || entries.length === 0) {
                return interaction.editReply({ content: 'No leaderboard data available.' });
            }

            const leaderboardItems = [];
            for (const entry of entries) {
                const userId = entry.id;
                let username = 'Unknown';
                try {
                    const userResponse = await Promise.race([
                        axios.get(`https://users.roblox.com/v1/users/${userId}`),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                    ]);
                    username = userResponse.data.name;
                } catch (e) {
                    console.error('Error fetching Roblox username for leaderboard:', e);
                }
                leaderboardItems.push(`**${username}** (${userId}): ${entry.value}`);
            }

            const embed = new EmbedBuilder()
                .setTitle('🏆 Game Leaderboard')
                .setDescription(leaderboardItems.join('\n'))
                .setColor(colors.primary)
                .setFooter({ text: 'Top 10 players' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Leaderboard fetch error:', error);
            await interaction.editReply({ content: 'Failed to fetch leaderboard.' });
        }
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

app.post('/check-code', async (req, res) => {
    try {
        const { secret, enteredCode, robloxId } = req.body;

        console.log("🔍 Code check received:", { enteredCode: enteredCode ? '✓' : '✗' });

        if (secret !== WEBHOOK_SECRET) {
            console.log("❌ Secret mismatch!");
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const match = Object.entries(verifications).find(
            ([_, v]) => v.tempCode === enteredCode && v.status === 'pending'
        );
        
        if (!match) {
            console.log("❌ No matching code found for:", enteredCode);
            return res.status(400).json({ success: false, error: 'Invalid or expired code' });
        }

        const [discordId, record] = match;

        if (Date.now() - record.codeTimestamp > CODE_EXPIRATION_MS) {
            console.log("⏰ Code expired for:", enteredCode);
            return res.status(400).json({ success: false, error: 'Code expired' });
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

        // Fetch Discord avatar and ensure it's PNG format
        let avatarBase64 = null;
        if (record.discordAvatar) {
            try {
                console.log('📥 Fetching avatar from:', record.discordAvatar);
                
                // Fetch the avatar
                const avatarResponse = await axios.get(record.discordAvatar, {
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'DiscordBot (VerificationBot, 1.0)'
                    }
                });
                
                console.log('✅ Avatar fetched, size:', avatarResponse.data.byteLength, 'bytes');
                console.log('📋 Content-Type:', avatarResponse.headers['content-type']);
                
                // Convert to PNG using sharp (handles WebP, JPEG, PNG, etc.)
                const pngBuffer = await sharp(avatarResponse.data)
                    .resize(128, 128) // Resize to reasonable size
                    .png() // Convert to PNG
                    .toBuffer();
                
                avatarBase64 = pngBuffer.toString('base64');
                console.log(`✅ Converted to PNG (${avatarBase64.length} chars base64, ${pngBuffer.length} bytes)`);
                
                // Verify PNG signature
                const sig = [pngBuffer[0], pngBuffer[1], pngBuffer[2], pngBuffer[3]];
                console.log('🔍 PNG signature:', sig.join(', '), '(should be 137, 80, 78, 71)');
                
            } catch (error) {
                console.error('❌ Error processing Discord avatar:', error.message);
            }
        }

        console.log(`✅ Code valid for ${discordId}`);
        res.json({
            success: true,
            discordId: discordId,
            discordTag: record.discordTag,
            discordAvatarBase64: avatarBase64,
            robloxUsername: robloxUsername
        });
    } catch (error) {
        console.error('❌ Check code error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});
// UPDATED: Verify webhook - now expects confirmation
app.post('/verify-webhook', async (req, res) => {
    try {
        const { secret, robloxId, enteredCode, discordTag, confirmed } = req.body;

        console.log("📥 Webhook received:", { robloxId, enteredCode: enteredCode ? '✓' : '✗', confirmed });

        if (secret !== WEBHOOK_SECRET) {
            console.log("❌ Secret mismatch!");
            return res.status(401).send('Unauthorized');
        }

        if (!confirmed) {
            console.log("❌ Verification not confirmed by user");
            return res.status(400).send('Verification not confirmed');
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

        await dbSaveVerification(discordId, discordTag || record.discordTag || 'Unknown', robloxId, robloxUsername, Date.now());

        console.log(`✅ Verified user ${discordId} as ${robloxUsername} (${robloxId})`);

        const completionEmbed = createVerificationCompleteEmbed(robloxUsername, robloxId, Date.now());
        const successEmbed = new EmbedBuilder()
            .setTitle('🎊 Welcome to the Community!')
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