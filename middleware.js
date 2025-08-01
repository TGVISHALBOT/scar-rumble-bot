require('dotenv').config();

const { Client, GatewayIntentBits, Partials, InteractionType } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// === CONFIGURATION ===
const ALLOWED_USER_IDS = ['123456789012345678']; // <-- Add allowed User IDs here
const ALLOWED_ROLE_IDS = ['112233445566778899']; // <-- Add allowed Role IDs here
// =====================

client.on('ready', () => {
    console.log(`Middleware Bot is online as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (interaction.type !== InteractionType.MessageComponent) return;
    if (!interaction.customId) return;

    // Filter only Rumble Royale Buttons (optional, can remove this filter if needed)
    if (!interaction.customId.includes('join') && !interaction.customId.includes('rumble')) return;

    const member = await interaction.guild.members.fetch(interaction.user.id);

    const isAllowedUser = ALLOWED_USER_IDS.includes(interaction.user.id);
    const hasAllowedRole = member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id));

    if (!isAllowedUser && !hasAllowedRole) {
        await interaction.reply({ content: "🚫 You are not allowed to join this Rumble Royale match.", ephemeral: true });
        return;
    }

    // Let allowed users pass through
    await interaction.deferUpdate();
});

client.login(process.env.BOT_TOKEN);
