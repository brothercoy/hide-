export const GAME_MODES = {
    redacted: {
        id: 'redacted',
        name: 'Redacted',
        description: 'Find the target before everyone else. Each round, the last player to find it is eliminated. The last player standing wins the match. Most match wins takes the game.',
        minPlayers: 2,
        maxPlayers: 10,
        defaultSettings: {
            matches: 1,
            roundTime: 30,
            charCount: 80,
            speedScale: 0.2,
            minPlayers: 2
        },
        settingsOptions: {
            matches: {
                label: 'Matches',
                min: 1,
                max: 10,
                default: 1
            },
            roundTime: {
                label: 'Round Time',
                min: 1,
                max: 60,
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
        name: 'Frequency',
        description: 'No eliminations. Everyone finds the target each round. Most wins at the end takes the game. Ties broken by fastest average find time.',
        minPlayers: 2,
        maxPlayers: 10,
        defaultSettings: {
            rounds: 5,
            roundTime: 30,
            speedScale: 0.2,
            minPlayers: 2
        },
        settingsOptions: {
            rounds: {
                label: 'Rounds',
                min: 1,
                max: 50,
                default: 5
            },
            roundTime: {
                label: 'Round Time',
                min: 1,
                max: 60,
                default: 30,
                unit: 's'
            },
            speedScale: {
                label: 'Speed',
                options: [0.1, 0.2, 0.4],
                labels: ['Slow', 'Normal', 'Fast'],
                default: 0.2
            }
        }
    }
};