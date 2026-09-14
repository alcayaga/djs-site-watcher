module.exports = {
    monitorType: 'AppleFeature',
    monitorName: 'AppleFeature:iOS',
    changes: {
        added: [
            { featureName: "Accessibility: VoiceOver", region: "Spanish (Chile)", id: "voiceover" },
            { featureName: "Accessibility: VoiceOver", region: "Spanish (Latin America)", id: "voiceover" },
            { featureName: "Accessibility: VoiceOver", region: "Chile", id: "voiceover" },
            { featureName: "Accessibility: Live Speech", region: "Spanish (Chile)", id: "live-speech" },
            { featureName: "Apple Intelligence: Calendar", region: "Spanish (Chile)", id: "calendar" },
            { featureName: "Apple Intelligence: Calendar", region: "Chile", id: "calendar" },
            { featureName: "Maps: Preferred Route", region: "Chile", id: "maps" },
            { featureName: "Maps: Visited Places", region: "Chile", id: "maps" },
        ],
        removed: [
            { featureName: "Siri: Directions", region: "Chile", id: "siri" }
        ]
    }
};
