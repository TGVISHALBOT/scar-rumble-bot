require('dotenv').config();
const fs = require('fs');
const express = require('express');
const { Client, GatewayIntentBits, Partials, EmbedBuilder, Collection, Routes, REST, SlashCommandBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

let scarPoints = new Map();
const SCAR_POINTS_FILE = './scar_points.json';

// Load SCAR Points from file
if (fs.existsSync(SCAR_POINTS_FILE)) {
    const data = JSON.parse(fs.readFileSync(SCAR_POINTS_FILE, 'utf8'));
    scarPoints = new Map(Object.entries(data));
    console.log('Loaded SCAR points from file.');
}

function saveScarPoints() {
    fs.writeFileSync(SCAR_POINTS_FILE, JSON.stringify(Object.fromEntries(scarPoints), null, 2));
    console.log('SCAR points saved.');
}

const trackThemes = [
    { name: "Tokyo Drift", emoji: "🛼" },
    { name: "Desert Rally", emoji: "🌼" },
    { name: "Space Race", emoji: "🞐" },
    { name: "Thunder Speedway", emoji: "⚡" },
    { name: "Neon Drift Arena", emoji: "🌟" },
    { name: "Turbo Tunnel", emoji: "🚀" },
    { name: "Velocity Circuit", emoji: "🏃‍♂️" },
    { name: "Asphalt Jungle", emoji: "🌴" }
];

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

    // Clear Global Commands
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    console.log('Cleared Global Commands');

    // Register Guild Commands
    const commands = [
        new SlashCommandBuilder()
            .setName('startscar')
            .setDescription('Start a SUI Cars Rumble')
            .addIntegerOption(option => option.setName('time').setDescription('Countdown time in seconds').setRequired(true))
            .addStringOption(option => option.setName('roles').setDescription('Mention allowed roles (separate with space)').setRequired(true))
            .addStringOption(option => option.setName('track').setDescription('Track Theme').addChoices(
                { name: 'Tokyo Drift', value: 'Tokyo Drift' },
                { name: 'Desert Rally', value: 'Desert Rally' },
                { name: 'Space Race', value: 'Space Race' },
                { name: 'Thunder Speedway', value: 'Thunder Speedway' },
                { name: 'Neon Drift Arena', value: 'Neon Drift Arena' },
                { name: 'Turbo Tunnel', value: 'Turbo Tunnel' },
                { name: 'Velocity Circuit', value: 'Velocity Circuit' },
                { name: 'Asphalt Jungle', value: 'Asphalt Jungle' }
            ).setRequired(false))
            .addRoleOption(option => option.setName('scarrole').setDescription('SCAR Role to assign (optional)').setRequired(false))
            .addIntegerOption(option => option.setName('points').setDescription('$SCAR points to award winner (optional)').setRequired(false)),
        new SlashCommandBuilder()
            .setName('leaderboard')
            .setDescription('Show $SCAR Points Leaderboard'),
        new SlashCommandBuilder()
            .setName('myscar')
            .setDescription('Check your $SCAR balance')
    ].map(cmd => cmd.toJSON());

    // Uncomment to register in GUILD only (safe during dev)
    // await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: commands });

    // For Global Commands (takes 1hr+ to propagate)
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

    console.log('Slash Commands Registered');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'startscar') {
        const countdown = interaction.options.getInteger('time');
        const rolesInput = interaction.options.getString('roles');
        const scarRole = interaction.options.getRole('scarrole');
        const scarPointReward = interaction.options.getInteger('points') || 0;

        // Parse role mentions
        const roleMentions = rolesInput.match(/<@&(\d+)>/g);
        if (!roleMentions) {
            return interaction.reply('⚠️ No valid roles mentioned. Please mention roles like @Role1 @Role2');
        }

        const allowedRoleIds = roleMentions.map(mention => mention.match(/\d+/)[0]);

        let trackName = interaction.options.getString('track');
        if (!trackName) {
            const randomTrack = trackThemes[Math.floor(Math.random() * trackThemes.length)];
            trackName = `${randomTrack.emoji} ${randomTrack.name}`;
        } else {
            const theme = trackThemes.find(t => t.name.toLowerCase() === trackName.toLowerCase());
            if (theme) trackName = `${theme.emoji} ${theme.name}`;
        }

        const embed = new EmbedBuilder()
            .setTitle(`🚗 SUI Cars Rumble Starting Soon!`)
            .setDescription(`🏎️ **Track:** ${trackName}
⏳ **Starts in:** ${countdown} seconds

React with 🏁 to join!
Only members with ${roleMentions.join(' ')} can participate.`)
            .setColor(0x00FF00);

        const reply = await interaction.reply({ embeds: [embed] });
        const rumbleMessage = await interaction.fetchReply();
        await rumbleMessage.react('🏁');

        let countdownRemaining = countdown;
        const countdownInterval = setInterval(async () => {
            countdownRemaining -= 30;

            if (countdownRemaining <= 0) {
                clearInterval(countdownInterval);
                return;
            }

            const updatedEmbed = new EmbedBuilder()
                .setTitle('⏳ Countdown Update!')
                .setDescription(`SUI Cars Rumble starts in **${countdownRemaining} seconds**!
React to the original message above with 🏁 to participate in the SUI Cars Rumble!`)
                .setColor('Orange');

            await interaction.followUp({ embeds: [updatedEmbed] });
        }, 30000);

        const reactionFilter = (reaction, user) => {
            if (reaction.emoji.name !== '🏁' || user.bot) return false;

            const member = interaction.guild.members.cache.get(user.id);
            if (!member) return false;

            return member.roles.cache.some(role => allowedRoleIds.includes(role.id));
        };

        const reactionCollector = rumbleMessage.createReactionCollector({ filter: reactionFilter, time: countdown * 1000 });

        const participants = new Collection();
        reactionCollector.on('collect', (reaction, user) => {
            participants.set(user.id, user);
        });

        reactionCollector.on('end', async () => {
            clearInterval(countdownInterval);

            if (participants.size === 0) {
                return interaction.followUp('No participants joined. Rumble canceled.');
            }

            await startRumble(interaction, participants.map(p => p), trackName, scarRole ? scarRole.id : null, scarPointReward);
        });
    }

    if (interaction.commandName === 'leaderboard') {
        if (scarPoints.size === 0) return interaction.reply('No $SCAR points have been awarded yet.');

        const sorted = [...scarPoints.entries()].sort((a, b) => b[1] - a[1]);
        const leaderboard = sorted.map(([userId, points], index) => `#${index + 1} <@${userId}> - ${points} $SCAR`).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('$SCAR Leaderboard')
            .setDescription(leaderboard)
            .setColor(0xFFD700);

        interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'myscar') {
        const userPoints = scarPoints.get(interaction.user.id) || 0;
        interaction.reply(`You have ${userPoints} $SCAR.`);
    }
});

async function startRumble(interaction, participants, trackTheme, scarRoleId, scarPointReward) {
    let activePlayers = [...participants];
    const funnyElims = [
        'lost control and flew off the track!',
        'crashed into a pit stop and got eliminated!',
        'spun out after a crazy drift!',
        'took a wrong turn into the garage!',
        'hit the turbo too hard and flipped over!',
        'accidentally hit the eject button!',
        'forgot to refuel and had to retire!',
        'celebrated too early and crashed!',
        'got caught in a photo-finish chaos!',
        'mistook reverse gear for turbo boost!'
    ];

    const startEmbed = new EmbedBuilder()
        .setTitle('🏁 SUI Cars Rumble Started!')
        .setDescription(`**Track:** ${trackTheme}`)
        .addFields({ name: 'Participants', value: activePlayers.map(p => p.username).join(', ') })
        .setColor('Yellow');

    await interaction.followUp({ embeds: [startEmbed] });

    while (activePlayers.length > 1) {
        await new Promise(res => setTimeout(res, 6000));
        const elimCount = Math.min(Math.floor(Math.random() * 4) + 2, activePlayers.length - 1);
        let eliminated = [];

        for (let i = 0; i < elimCount; i++) {
            const elimIndex = Math.floor(Math.random() * activePlayers.length);
            let eliminatedPlayer = activePlayers.splice(elimIndex, 1)[0];

            if (Math.random() < 0.20) {
                activePlayers.push(eliminatedPlayer);
                continue;
            }

            eliminated.push(eliminatedPlayer);
        }

        const elimEmbed = new EmbedBuilder()
            .setTitle('❌ Eliminations!')
            .setDescription(eliminated.map(p => `~~${p.username}~~ ${funnyElims[Math.floor(Math.random() * funnyElims.length)]}`).join('\n'))
            .setColor('Red');

        await interaction.followUp({ embeds: [elimEmbed] });
    }

    await interaction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('🏆 Winner!')
                .setDescription(`Congratulations <@${activePlayers[0].id}>! You are the SUI Cars Champion!`)
                .setColor('Green')
        ]
    });

    if (scarRoleId) {
        const guild = interaction.guild;
        const member = await guild.members.fetch(activePlayers[0].id);
        if (member) {
            await member.roles.add(scarRoleId);
        }
    }

    if (scarPointReward && !isNaN(scarPointReward)) {
        const currentPoints = parseInt(scarPoints.get(activePlayers[0].id)) || 0;
        scarPoints.set(activePlayers[0].id, currentPoints + scarPointReward);
        saveScarPoints();
    }
}

client.login(process.env.BOT_TOKEN);

// Express keepalive server
const app = express();
app.get('/', (req, res) => res.send('Bot is Running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Express server is running on port ${PORT}`));
