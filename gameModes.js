export const GAME_MODES = {
    redacted: {
        id: 'redacted',
        name: 'DEL',
        description: 'Each round, you will have thirty seconds to find the target character. The last player to find it loses a life. After losing three lives, a player is DELETED and eliminated from the match. Last player standing wins.',
        minPlayers: 2,
        maxPlayers: 10,
        defaultSettings: {
            lives: 3,
            matches: 1,
            roundTime: 30,
            charCount: 80,
            speedScale: 0.2,
            minPlayers: 2
        },
        settingsOptions: {
            lives: {
                label: 'Lives',
                min: 1,
                max: 10,
                default: 3
            },
            matches: {
                label: 'Matches',
                min: 1,
                max: 10,
                default: 1
            },
            roundTime: {
                label: 'Round Time',
                min: 1,
                max: 120,
                default: 30,
                unit: 's'
            },
            charCount: {
                label: 'Characters',
                min: 30,
                max: 150,
                default: 80,
                unit: ''
            },
            speedScale: {
                label: 'Speed',
                options: [0.1, 0.2, 0.4],
                labels: ['Slow', 'Normal', 'Fast'],
                default: 0.2
            }
        }
    },

    frequency: {
        id: 'frequency',
        name: 'ACK',
        description: 'Players will earn points by being the fastest to ACKNOWLEDGE the target. Each round will get more difficult and yield more points. After ten rounds, the player with the highest score wins.',
        minPlayers: 2,
        maxPlayers: 10,
        // Frequency's settings are the ROUND-1 (starting) difficulty; the server ramps each up toward
        // a harder end over the rounds (see ACK_RAMP in GameRoom). Defaults are the easy end so the
        // stock curve runs 30→150 chars, slow→fast, and 60s→20s across 20 rounds (a 10-round game hits the midpoint).
        defaultSettings: {
            rounds: 10,
            roundTime: 60,
            charCount: 30,
            speedScale: 0.1,
            minPlayers: 2
        },
        settingsOptions: {
            rounds: {
                label: 'Rounds',
                min: 1,
                max: 20,
                default: 10
            },
            roundTime: {
                label: 'Round Time',
                min: 1,
                max: 120,
                default: 60,
                unit: 's'
            },
            charCount: {
                label: 'Characters',
                min: 30,
                max: 150,
                default: 30,
                unit: ''
            },
            speedScale: {
                label: 'Speed',
                options: [0.1, 0.2, 0.4],
                labels: ['Slow', 'Normal', 'Fast'],
                default: 0.1
            }
        }
    }
};