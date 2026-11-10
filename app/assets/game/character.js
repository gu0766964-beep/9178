/**
 * 角色精灵数据
 * 使用方案二：上下弹跳行走动画
 */
window.MowCharacter = window.MowCharacter || {};

window.MowCharacter.SPRITE = {
    // 精灵图路径
    walkHigh: 'game/sprite/walk_high.png',
    dataPath: 'game/sprite/data.json',
    
    // 动画配置
    FPS: 12,
    frames: 4,
    
    // 角色尺寸
    width: 128,
    height: 85,
    
    // 帧信息
    frameData: [
        { name: 'walk_0', x: 0, y: 0, width: 128, height: 85 },
        { name: 'walk_1', x: 128, y: 0, width: 128, height: 85 },
        { name: 'walk_2', x: 256, y: 0, width: 128, height: 85 },
        { name: 'walk_3', x: 384, y: 0, width: 128, height: 85 }
    ]
};

window.MowCharacter.ANIM = {
    normal: {
        speed: 1,
        frameInterval: 1000 / 12  // 12fps
    },
    fast: {
        speed: 1.5,
        frameInterval: 1000 / 12
    },
    attack: {
        speed: 2,
        frameInterval: 1000 / 12
    }
};

// 动画帧数组
window.MowCharacter.FRAMES = [
    'walk_front',
    'walk_front_right', 
    'walk_back',
    'walk_back_right'
];

console.log('[Character] 角色精灵数据已加载');
