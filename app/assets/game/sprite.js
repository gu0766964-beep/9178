/**
 * 精灵动画管理器
 * 管理角色精灵图 + 动画循环（方案二：上下弹跳行走）
 */
window.MowSprite = (function () {
    'use strict';

    // 动画状态
    const ANIM_STATE = {
        IDLE: 'idle',        // 待机
        WALK: 'walk',        // 行走
        ATTACK: 'attack'     // 攻击
    };

    // 精灵状态
    let currentFrameIndex = 0;
    let lastFrameTime = 0;
    let currentAnim = ANIM_STATE.WALK;
    let canvas = null;
    let srcImage = null;
    let frameW = 128;
    let frameH = 85;
    let spriteSheet = null;
    let fps = 12;

    /**
     * 加载精灵工作表
     */
    function loadSpriteSheet(url, targetFps) {
        console.log('[Sprite] 加载精灵图: ' + url);
        fps = targetFps || 12;
        
        spriteSheet = new Image();
        spriteSheet.src = url;
        spriteSheet.onload = function () {
            frameW = spriteSheet.width / 4;
            frameH = spriteSheet.height;
            console.log('[Sprite] 加载完成: ' + spriteSheet.width + 'x' + spriteSheet.height);
        };
    }

    /**
     * 绘制精灵到画布
     * @param {CanvasRenderingContext2D} ctx 
     * @param {number} x 
     * @param {number} y 
     */
    function draw(ctx, x, y, scale) {
        if (!spriteSheet || !srcImage) return;
        
        scale = scale || 1;
        const drawX = Math.round(x);
        const drawY = Math.round(y);
        
        // 绘制当前帧
        ctx.drawImage(
            spriteSheet,
            currentFrameIndex * frameW, 0, frameW, frameH,  // 源区域
            drawX, drawY, frameW * scale, frameH * scale     // 目标区域
        );
    }

    /**
     * 更新动画帧率
     */
    function update(now) {
        const interval = 1000 / fps;
        if (now - lastFrameTime >= interval) {
            lastFrameTime = now;
            currentFrameIndex = (currentFrameIndex + 1) % 4;
        }
    }

    /**
     * 切换动画状态
     */
    function changeAnim(animName) {
        currentAnim = animName;
        currentFrameIndex = 0;
        lastFrameTime = performance.now();
        console.log('[Sprite] 切换到: ' + animName);
    }

    /**
     * 获取当前帧
     */
    function getCurrentFrame() {
        return currentFrameIndex;
    }

    /**
     * 开始/停止动画循环
     */
    function startAnimation(callback) {
        function animate(now) {
            update(now);
            if (callback) callback(now);
            requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);
    }

    return {
        loadSpriteSheet: loadSpriteSheet,
        draw: draw,
        update: update,
        changeAnim: changeAnim,
        getCurrentFrame: getCurrentFrame,
        startAnimation: startAnimation,
        ANIM_STATE: ANIM_STATE,
        get currentFrame() { return currentFrameIndex; },
        get fps() { return fps; },
        get frameW() { return frameW; },
        get frameH() { return frameH; }
    };
})();