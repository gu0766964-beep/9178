/* 由 tools/gen_manifest.py 自动生成，请勿手改。
   作用：把公告与历史版本内置进 APK（冷更新），随安装包一起下发。*/
window.__MOW_NOTICE__ = {
 "versionCode": 50,
 "versionName": "2.5.18",
 "date": "2026-11-09",
 "apkUrl": "https://github.com/gu0766964-beep/9178/releases/download/v2.5.18/survivor-2.5.18.apk",
 "notice": {
  "add": [
   "全自动发版：游戏更新后一键生成完整安装包并自动下发新版本",
   "公告改为右侧滑出面板：冷更新与热更新合并展示，只有公告支持热更新",
   "内置历史公告：点版本号即可查看该版本更新内容与修复项",
   "首页左上角新增「公告」入口，随时回看全部历史版本"
  ],
  "fix": [
   "移除 cloud.js 文件级热更，脚本与资源只能随安装包下发",
   "统一 manifest 与 APK 的版本号来源，修复版本号错乱"
  ]
 },
 "history": [
  {
   "versionCode": 50,
   "versionName": "2.5.18",
   "date": "2026-11-09",
   "add": [
    "全自动发版：游戏更新后一键生成完整安装包并自动下发新版本",
    "公告改为右侧滑出面板：冷更新与热更新合并展示，只有公告支持热更新",
    "内置历史公告：点版本号即可查看该版本更新内容与修复项",
    "首页左上角新增「公告」入口，随时回看全部历史版本"
   ],
   "fix": [
    "移除 cloud.js 文件级热更，脚本与资源只能随安装包下发",
    "统一 manifest 与 APK 的版本号来源，修复版本号错乱"
   ]
  },
  {
   "versionCode": 49,
   "versionName": "2.5.17",
   "date": "",
   "add": [
    "冷更新+热更新公告合并",
    "修复版本并发问题"
   ],
   "fix": [
    "修复已知问题"
   ]
  },
  {
   "versionCode": 48,
   "versionName": "2.5.16",
   "date": "",
   "add": [
    "冷更新 + 热更新 公告"
   ],
   "fix": [
    "修复版本并发问题"
   ]
  },
  {
   "versionCode": 47,
   "versionName": "2.5.15",
   "date": "",
   "add": [
    "音乐/背景视频上传云端 + 首页「检查更新」+ 游戏公告",
    "云端 `cloud/manifest.json` 全量扫描 `app/assets/`（含 10 首音乐 + 8 个背景视频），记录每个文件的 md5",
    "安卓壳 WebView 拦截外链（`shouldOverrideUrlLoading`/`onCreateWindow`），不验证 `file://` 安全",
    "`build_apk.py` 改读 `manifest.json` 版本（fallback 2.5.15/47）；`gen_manifest.py` 支援 `--apk-url/--add/--fix`"
   ],
   "fix": []
  },
  {
   "versionCode": 46,
   "versionName": "2.5.14",
   "date": "",
   "add": [
    "热更新改冷更新"
   ],
   "fix": []
  },
  {
   "versionCode": 45,
   "versionName": "2.5.12",
   "date": "",
   "add": [
    "结算公式三项化 + 掉落经验 +50% + 死亡兜底",
    "结算金币 = 5 + 击杀×1.5 + 存活秒数×0.6 + 等级×20（90s/10杀/3级 → 134；600s/100杀/15级 → 815）",
    "修复「从存档继续的那一局死了不给金币」",
    "修复死亡/升级竞态：卡在升级三选一时血量见底，选完卡会正确进入结算",
    "掉落经验整体 +50%"
   ],
   "fix": []
  },
  {
   "versionCode": 44,
   "versionName": "2.5.11",
   "date": "",
   "add": [
    "立即结算防刷"
   ],
   "fix": []
  },
  {
   "versionCode": 43,
   "versionName": "2.5.10",
   "date": "",
   "add": [
    "经验曲线重做 + 等级钳制 + 立即结算"
   ],
   "fix": []
  },
  {
   "versionCode": 42,
   "versionName": "2.5.9",
   "date": "",
   "add": [
    "屌炸天每波成长 0.5% → 2%"
   ],
   "fix": []
  },
  {
   "versionCode": 41,
   "versionName": "2.5.8",
   "date": "",
   "add": [
    "选卡存档修复"
   ],
   "fix": []
  },
  {
   "versionCode": 40,
   "versionName": "2.5.7",
   "date": "",
   "add": [
    "选卡即存档，大退后回到同一波同一级并保留待选卡片。"
   ],
   "fix": []
  },
  {
   "versionCode": 39,
   "versionName": "2.5.6",
   "date": "",
   "add": [
    "修复固定摇杆模式在首页提前出现。"
   ],
   "fix": []
  },
  {
   "versionCode": 38,
   "versionName": "2.5.5",
   "date": "",
   "add": [
    "玩家子弹不再击落怪物子弹。"
   ],
   "fix": []
  },
  {
   "versionCode": 37,
   "versionName": "2.5.4",
   "date": "",
   "add": [
    "升级经验改线性（每级 +6），缓解后期只靠 BOSS 升级。"
   ],
   "fix": []
  },
  {
   "versionCode": 36,
   "versionName": "2.5.3",
   "date": "",
   "add": [
    "飞刀命中即消失（不穿透）；升级卡片切后台/重进保持原样。"
   ],
   "fix": []
  },
  {
   "versionCode": 35,
   "versionName": "2.5.2",
   "date": "",
   "add": [
    "首页去掉战斗 UI；战斗商店滑动不再误购；商店 UI 紧凑化。"
   ],
   "fix": []
  },
  {
   "versionCode": 34,
   "versionName": "2.5.1",
   "date": "",
   "add": [
    "性能优化：经验宝石软上限 220、空间哈希重建 3→2 次/帧、子弹相位化检测、飘字分桶渲染、飘字上限 56。"
   ],
   "fix": []
  },
  {
   "versionCode": 33,
   "versionName": "2.5",
   "date": "",
   "add": [
    "武器 6→10（碎冰 / 链电 / 箭雨 / 死光）、被动 11→15、战斗商店 5→10 件、金币掉落 +30%。"
   ],
   "fix": []
  },
  {
   "versionCode": 32,
   "versionName": "2.4.5",
   "date": "",
   "add": [
    "首页 UI 完全透明，背景视频完整露出。"
   ],
   "fix": []
  },
  {
   "versionCode": 31,
   "versionName": "2.4.4",
   "date": "",
   "add": [
    "技能扩到 10 个（迅捷/吸血/暴击/成长）；升级三选一改五选一；首页商店扩到 8 件（旺盛种子 / 贪婪契约 / 背水一战）；首页 UI 半透明化。"
   ],
   "fix": []
  },
  {
   "versionCode": 30,
   "versionName": "2.4.3",
   "date": "",
   "add": [
    "首页背景视频取消静音（无手势环境退回静音）；回首页自动暂停音乐、进游戏续播。"
   ],
   "fix": []
  },
  {
   "versionCode": 29,
   "versionName": "2.4.2",
   "date": "",
   "add": [
    "「跳过 ▸」热区放大 + 400ms 防误触窗口。"
   ],
   "fix": []
  },
  {
   "versionCode": 28,
   "versionName": "2.4.1",
   "date": "",
   "add": [
    "首页换上用户上传的背景视频，随机播放、播完换下一个。"
   ],
   "fix": []
  },
  {
   "versionCode": 27,
   "versionName": "2.4",
   "date": "",
   "add": [
    "职业系统（5 职业）；BOSS 扩到 8 种并随机生成；新怪 4 种（毒尾蝎 / 血翼蝠 / 女巫医 / 爆裂者）；中毒状态；首页简化为「开始/继续 + 角色·商店·设置」。"
   ],
   "fix": []
  },
  {
   "versionCode": 26,
   "versionName": "2.3.1",
   "date": "",
   "add": [
    "怪物等级系统：每波 +2 级，每级全属性按难度成长（简单 +3% ~ 屌炸天 +14%），波次横幅显示「第 N 波 · 怪物 Lv.M」。"
   ],
   "fix": []
  },
  {
   "versionCode": 25,
   "versionName": "2.3",
   "date": "",
   "add": [
    "数值口径修正（怪物受伤减免封顶 80%）、怪物不受击退、击杀 BOSS 回满血、战斗商店改每 5 波、BOSS 数量随波数（屌炸天无上限）。"
   ],
   "fix": []
  },
  {
   "versionCode": 24,
   "versionName": "2.2.3",
   "date": "",
   "add": [
    "内置曲扩到 11 首（新增不将就 / 你最近过的还好吗 / 第57次取消发送 / 我们俩 / 魔术师）。"
   ],
   "fix": []
  },
  {
   "versionCode": 23,
   "versionName": "2.2.1–2.2.2",
   "date": "",
   "add": [
    "修复「新游戏」难度面板被盖住；默认随机播放；游戏内新增切歌与播放模式按钮。"
   ],
   "fix": []
  },
  {
   "versionCode": 22,
   "versionName": "2.2",
   "date": "",
   "add": [
    "6 档难度系统 + 4 种 BOSS 轮番 + 战斗商店属性类改为每次本局 +1%。"
   ],
   "fix": []
  },
  {
   "versionCode": 21,
   "versionName": "2.1.4",
   "date": "",
   "add": [
    "游戏内按钮改 pointerdown 即时响应（修复多指触屏下点不到按钮）。"
   ],
   "fix": []
  },
  {
   "versionCode": 20,
   "versionName": "2.1.3",
   "date": "",
   "add": [
    "多点触控下边走边点；同屏怪物多时模型自动降级保帧率。"
   ],
   "fix": []
  },
  {
   "versionCode": 19,
   "versionName": "2.1.2",
   "date": "",
   "add": [
    "弹层返回按钮挪到左上角；「跳过 ▸」挪到右上角。"
   ],
   "fix": []
  },
  {
   "versionCode": 18,
   "versionName": "2.1.1",
   "date": "",
   "add": [
    "修复覆盖安装签名不一致：keystore 持久保存（2.1 及更早需卸载一次升级）。"
   ],
   "fix": []
  },
  {
   "versionCode": 17,
   "versionName": "2.1",
   "date": "",
   "add": [
    "内置曲 +4（One More Last Time / 给你呀 / 滕王阁小曲 / 只对你有感觉）。"
   ],
   "fix": []
  },
  {
   "versionCode": 16,
   "versionName": "2.0",
   "date": "",
   "add": [
    "战斗商店（每 10 波，本局金币）；首页金币改死亡结算；波间全屏吸附经验；跳过休息；自动存档；音乐独立播放卡片（顺序/单循/随机）；修复攻击键不出现。"
   ],
   "fix": []
  },
  {
   "versionCode": 15,
   "versionName": "1.9",
   "date": "",
   "add": [
    "HUD 挪到左上角并加「剩余怪物」计数。"
   ],
   "fix": []
  },
  {
   "versionCode": 14,
   "versionName": "1.8",
   "date": "",
   "add": [
    "播放列表并入设置页。"
   ],
   "fix": []
  },
  {
   "versionCode": 13,
   "versionName": "1.7",
   "date": "",
   "add": [
    "内置《雨爱》。"
   ],
   "fix": []
  },
  {
   "versionCode": 12,
   "versionName": "1.6",
   "date": "",
   "add": [
    "击杀 BOSS 强制升级；疾走虫冲锋 / 精英水晶弹 / BOSS 弹幕冲撞。"
   ],
   "fix": []
  },
  {
   "versionCode": 11,
   "versionName": "1.5.1",
   "date": "",
   "add": [
    "设置页可滚动、首页加设置入口。"
   ],
   "fix": []
  },
  {
   "versionCode": 10,
   "versionName": "1.5",
   "date": "",
   "add": [
    "修复导入音乐无法播放、首页商店打不开；手动攻击模式（攻击键 + 辅助瞄准）；像素人物。"
   ],
   "fix": []
  },
  {
   "versionCode": 9,
   "versionName": "1.4",
   "date": "",
   "add": [
    "波次系统（休息 10 秒、每 5 波 BOSS）；经验分级；悟性被动；每级 +10 血；斗篷小人与五种敌人模型；播放列表（导入存 IndexedDB）；商店只在首页。"
   ],
   "fix": []
  }
 ]
};
