/* KUROKAZE IV — Distinct Weapon Kits, Directional Moves, Unique Q/E/R Skills & Sever Profiles
 * Loaded after controls.js and before fx.js, render.js, and game.js.
 */
(function (global) {
  'use strict';

  const WEAPONS = [
    {
      id: 'katana',
      name: 'Katana',
      jp: '刀',
      desc: 'Crisp 3-hit iaijutsu cadence, widest 220ms Perfect Parry window, Flash Draw teleport & Moon Crescent.',
      stats: { speed: 76, reach: 68, posture: 64, parry: 94 },
      len: 78,
      reach: 108,
      parry: 0.22,
      dashCd: 0.42,
      kiMul: 1.0,
      moveSpd: 420,
      hits: 3,
      dual: false,
      guardCrush: false,
      diveBonus: false,
      combo: [
        {
          name: 'Kesagiri',
          dmg: 14, pos: 16, dur: 0.22, reach: 104, lunge: 240,
          pose: 'slash1', a0: -1.25, a1: 1.05, w: 16, red: false, sfx: 'swing',
          cutType: 'arm',
        },
        {
          name: 'Gyaku-Gesa',
          dmg: 17, pos: 21, dur: 0.25, reach: 110, lunge: 270,
          pose: 'slash2', a0: 1.25, a1: -1.35, w: 18, red: false, sfx: 'swing',
          cutType: 'high',
        },
        {
          name: 'Zantetsu',
          dmg: 26, pos: 36, dur: 0.34, reach: 122, lunge: 470,
          pose: 'slash3', a0: -1.35, a1: 1.15, w: 22, red: true, heavy: true, sfx: 'heavy',
          cutType: 'waist',
        },
      ],
      upAttack: {
        name: 'Rising Swallow',
        dmg: 16, pos: 22, dur: 0.28, reach: 102, lunge: 140, lift: -620,
        pose: 'slash2', a0: 1.35, a1: -1.75, w: 18, red: true, sfx: 'swing',
        cutType: 'high',
      },
      downAttack: {
        name: 'Ashibarai Cut',
        dmg: 15, pos: 28, dur: 0.27, reach: 116, lunge: 290, lowSweep: true, guardCrush: true,
        pose: 'iai', a0: 0.2, a1: 1.45, w: 17, red: true, sfx: 'swing',
        cutType: 'legs',
      },
      airAttack: {
        name: 'Swallow Cross',
        dmg: 16, pos: 18, dur: 0.24, reach: 104, vxBoost: 230, vyLift: -180,
        pose: 'airSlash', a0: -1.5, a1: 1.4, w: 18, red: false, sfx: 'swing',
        cutType: 'high',
      },
      skillQ: {
        id: 'iai_draw',
        name: 'Flash Draw',
        short: 'FLASH',
        jp: '居合抜刀',
        cost: 30,
        dmg: 36,
        pos: 34,
        range: 460,
        dur: 0.5,
        cutType: 'waist',
        desc: 'Teleport horizontal iaijutsu slash with delayed crimson sever.',
      },
      skillE: {
        id: 'moon_wave',
        name: 'Moon Crescent',
        short: 'WAVE',
        jp: '月斬波',
        cost: 40,
        dmg: 30,
        pos: 28,
        speed: 940,
        dur: 0.28,
        cutType: 'waist',
        desc: 'Fast piercing ink crescent that cuts through enemy projectiles.',
      },
      skillR: {
        id: 'eclipse',
        name: 'Eclipse Cuts',
        short: 'ECLIPSE',
        jp: '千斬蝕',
        cost: 100,
        dmgPlayer: 48,
        dmgBoss: 118,
        dmgMob: 170,
        cuts: 15,
        cutType: 'waist',
        desc: '15 blinding shadow cuts resolved with a single sheathe click.',
      },
    },

    {
      id: 'odachi',
      name: 'Odachi',
      jp: '大太刀',
      desc: 'Colossal greatsword that crushes guards, carries finisher hyper-armor, and splits the earth.',
      stats: { speed: 46, reach: 90, posture: 98, parry: 70 },
      len: 110,
      reach: 140,
      parry: 0.2,
      dashCd: 0.48,
      kiMul: 1.0,
      moveSpd: 368,
      hits: 3,
      dual: false,
      guardCrush: true,
      diveBonus: false,
      combo: [
        {
          name: 'Iron Arc',
          dmg: 21, pos: 30, dur: 0.31, reach: 136, lunge: 220,
          pose: 'slash1', a0: -1.45, a1: 1.15, w: 24, red: true, heavy: true, sfx: 'heavy',
          cutType: 'arm',
        },
        {
          name: 'Mountain Lift',
          dmg: 25, pos: 36, dur: 0.34, reach: 142, lunge: 250, armor: true,
          pose: 'slash2', a0: 1.4, a1: -1.55, w: 25, red: true, heavy: true, sfx: 'heavy',
          cutType: 'high',
        },
        {
          name: 'Heaven Cleave',
          dmg: 36, pos: 58, dur: 0.43, reach: 156, lunge: 430, armor: true, guardCrush: true, heavy: true,
          pose: 'slam', a0: -1.65, a1: 1.2, w: 30, red: true, sfx: 'heavy',
          cutType: 'cleave',
        },
      ],
      upAttack: {
        name: 'Sky Render',
        dmg: 24, pos: 34, dur: 0.36, reach: 132, lunge: 110, lift: -690, heavy: true,
        pose: 'slash2', a0: 1.5, a1: -1.8, w: 24, red: true, sfx: 'heavy',
        cutType: 'high',
      },
      downAttack: {
        name: 'Ankle Breaker',
        dmg: 22, pos: 38, dur: 0.35, reach: 146, lunge: 250, lowSweep: true, guardCrush: true, heavy: true,
        pose: 'iai', a0: 0.15, a1: 1.5, w: 24, red: true, sfx: 'heavy',
        cutType: 'legs',
      },
      airAttack: {
        name: 'Meteor Cleave',
        dmg: 28, pos: 40, dur: 0.34, reach: 136, vxBoost: 190, diveVy: 760, slamRadius: 145, heavy: true,
        pose: 'slam', a0: -1.6, a1: 1.35, w: 26, red: true, sfx: 'heavy',
        cutType: 'cleave',
      },
      skillQ: {
        id: 'earthsplitter',
        name: 'Earthsplitter',
        short: 'SPLIT',
        jp: '大地割',
        cost: 30,
        dmg: 34,
        pos: 48,
        shockDmg: 22,
        dur: 0.44,
        cutType: 'cleave',
        desc: 'Unblockable overhead slam that launches a crimson shockwave across the ground.',
      },
      skillE: {
        id: 'whirlwind',
        name: 'Whirlwind Cleave',
        short: 'WHIRL',
        jp: '旋風斬',
        cost: 40,
        dmg: 32,
        pos: 42,
        radius: 162,
        dur: 0.42,
        cutType: 'waist',
        desc: 'Armored 360-degree crimson sweep that cleaves enemies on both sides.',
      },
      skillR: {
        id: 'horizon',
        name: 'Crimson Horizon',
        short: 'HORIZON',
        jp: '紅地平',
        cost: 100,
        dmgPlayer: 52,
        dmgBoss: 132,
        dmgMob: 190,
        cuts: 7,
        cutType: 'cleave',
        desc: 'Colossal screen-splitting diagonal cleaves that shatter posture and earth.',
      },
    },

    {
      id: 'naginata',
      name: 'Naginata',
      jp: '薙刀',
      desc: 'Superior polearm reach, piercing Dragon Lunge, acrobatic Pole Vault Sweep & aerial Dive Slam.',
      stats: { speed: 68, reach: 98, posture: 74, parry: 82 },
      len: 120,
      reach: 152,
      parry: 0.21,
      dashCd: 0.42,
      kiMul: 1.05,
      moveSpd: 405,
      hits: 3,
      dual: false,
      guardCrush: false,
      diveBonus: true,
      combo: [
        {
          name: 'Piercing Reed',
          dmg: 14, pos: 18, dur: 0.23, reach: 156, lunge: 270,
          pose: 'thrust', a0: -0.45, a1: 0.45, w: 16, red: false, sfx: 'pole',
          cutType: 'arm',
        },
        {
          name: 'Crescent Pole',
          dmg: 17, pos: 24, dur: 0.26, reach: 150, lunge: 240,
          pose: 'slash2', a0: 1.35, a1: -1.45, w: 19, red: false, sfx: 'pole',
          cutType: 'high',
        },
        {
          name: 'Tempest Reap',
          dmg: 25, pos: 34, dur: 0.34, reach: 166, lunge: 420, heavy: true,
          pose: 'slash3', a0: -1.45, a1: 1.25, w: 22, red: true, sfx: 'pole',
          cutType: 'waist',
        },
      ],
      upAttack: {
        name: 'Heron Lift',
        dmg: 17, pos: 24, dur: 0.28, reach: 142, lunge: 130, lift: -650,
        pose: 'slash2', a0: 1.4, a1: -1.75, w: 18, red: true, sfx: 'pole',
        cutType: 'high',
      },
      downAttack: {
        name: 'Low Shaft Sweep',
        dmg: 16, pos: 30, dur: 0.28, reach: 160, lunge: 310, lowSweep: true, guardCrush: true,
        pose: 'iai', a0: 0.25, a1: 1.45, w: 19, red: true, sfx: 'pole',
        cutType: 'legs',
      },
      airAttack: {
        name: 'Dive Slam',
        dmg: 24, pos: 32, dur: 0.28, reach: 136, vxBoost: 290, diveVy: 680, slamRadius: 135, heavy: true,
        pose: 'airSlash', a0: -1.5, a1: 1.4, w: 20, red: true, sfx: 'pole',
        cutType: 'cleave',
      },
      skillQ: {
        id: 'dragon_lunge',
        name: 'Dragon Lunge',
        short: 'LUNGE',
        jp: '龍貫突',
        cost: 30,
        dmg: 13,
        pos: 14,
        strikes: 3,
        reach: 188,
        dur: 0.4,
        cutType: 'arm',
        desc: 'Rapid 3-strike forward polearm skewer that drives enemies back.',
      },
      skillE: {
        id: 'pole_vault',
        name: 'Pole Vault Sweep',
        short: 'VAULT',
        jp: '飛燕薙',
        cost: 40,
        dmg: 26,
        pos: 32,
        dur: 0.42,
        cutType: 'high',
        desc: 'Vaults high over foes while unleashing a downward crimson arc.',
      },
      skillR: {
        id: 'spear_storm',
        name: 'Storm of Spears',
        short: 'STORM',
        jp: '槍嵐',
        cost: 100,
        dmgPlayer: 48,
        dmgBoss: 122,
        dmgMob: 175,
        cuts: 14,
        cutType: 'arm',
        desc: 'Blinding volley of crimson polearm thrusts capped by a sky-piercer.',
      },
    },

    {
      id: 'wakizashi',
      name: 'Dual Blade',
      jp: '二刀',
      desc: 'Relentless 5-hit bleed flurry, rapid Flash-Step, Shadow Blink behind foes & 3-Kunai Storm.',
      stats: { speed: 98, reach: 50, posture: 58, parry: 58 },
      len: 56,
      reach: 90,
      parry: 0.165,
      dashCd: 0.26,
      kiMul: 1.38,
      moveSpd: 460,
      hits: 5,
      dual: true,
      guardCrush: false,
      diveBonus: false,
      combo: [
        {
          name: 'Twin Fang I',
          dmg: 9, pos: 11, dur: 0.15, reach: 86, lunge: 220,
          pose: 'slash1', a0: -1.2, a1: 0.95, w: 13, red: false, sfx: 'swing',
          cutType: 'arm', bleed: 2,
        },
        {
          name: 'Twin Fang II',
          dmg: 10, pos: 12, dur: 0.15, reach: 88, lunge: 230,
          pose: 'slash2', a0: 1.2, a1: -1.15, w: 14, red: false, sfx: 'swing',
          cutType: 'arm', bleed: 2,
        },
        {
          name: 'Cross Rip',
          dmg: 11, pos: 14, dur: 0.16, reach: 92, lunge: 260,
          pose: 'slash1', a0: -1.35, a1: 1.2, w: 15, red: true, sfx: 'swing',
          cutType: 'waist', bleed: 3,
        },
        {
          name: 'Viper Spin',
          dmg: 12, pos: 16, dur: 0.17, reach: 94, lunge: 280,
          pose: 'slash2', a0: 1.35, a1: -1.35, w: 16, red: false, sfx: 'swing',
          cutType: 'high', bleed: 3,
        },
        {
          name: 'Scissor Sever',
          dmg: 21, pos: 28, dur: 0.27, reach: 104, lunge: 440, heavy: true,
          pose: 'slash3', a0: -1.5, a1: 1.35, w: 20, red: true, sfx: 'heavy',
          cutType: 'arm', bleed: 6,
        },
      ],
      upAttack: {
        name: 'Twin Rising Fang',
        dmg: 14, pos: 18, dur: 0.22, reach: 88, lunge: 160, lift: -640,
        pose: 'slash2', a0: 1.4, a1: -1.75, w: 16, red: true, sfx: 'swing',
        cutType: 'high', bleed: 4,
      },
      downAttack: {
        name: 'Hamstring Slice',
        dmg: 13, pos: 24, dur: 0.21, reach: 98, lunge: 340, lowSweep: true, guardCrush: true,
        pose: 'iai', a0: 0.2, a1: 1.45, w: 16, red: true, sfx: 'swing',
        cutType: 'legs', bleed: 5,
      },
      airAttack: {
        name: 'Twin Cyclone',
        dmg: 15, pos: 18, dur: 0.21, reach: 92, vxBoost: 280, vyLift: -230,
        pose: 'airSlash', a0: -1.65, a1: 1.65, w: 17, red: true, sfx: 'swing',
        cutType: 'arm', bleed: 4,
      },
      skillQ: {
        id: 'shadow_blink',
        name: 'Shadow Blink',
        short: 'BLINK',
        jp: '影瞬殺',
        cost: 30,
        dmg: 26,
        pos: 30,
        range: 420,
        dur: 0.3,
        cutType: 'arm',
        bleed: 8,
        desc: 'Vanishes in ink and reappears behind the nearest foe with a bleeding cross-cut.',
      },
      skillE: {
        id: 'kunai_fan',
        name: 'Twin Kunai Storm',
        short: 'KUNAI',
        jp: '苦無嵐',
        cost: 40,
        dmg: 13,
        pos: 14,
        count: 3,
        speed: 880,
        dur: 0.26,
        cutType: 'arm',
        desc: 'Backflips while hurling a 3-kunai spread fan (parryable by skilled rivals).',
      },
      skillR: {
        id: 'phantom_cross',
        name: 'Phantom Cross',
        short: 'PHANTOM',
        jp: '影双斬',
        cost: 100,
        dmgPlayer: 48,
        dmgBoss: 120,
        dmgMob: 172,
        cuts: 18,
        cutType: 'arm',
        desc: 'Ink clones surround the enemy in a relentless twin-blade cyclone.',
      },
    },
  ];

  const BY_ID = Object.create(null);
  WEAPONS.forEach((w, idx) => {
    w.index = idx;
    BY_ID[w.id] = w;
  });

  const STAGES = [
    { id: 'bamboo', name: 'Bamboo Rain', jp: '竹林雨' },
    { id: 'temple', name: 'Burning Temple', jp: '炎上寺' },
    { id: 'bridge', name: 'Blood Moon Bridge', jp: '血月橋' },
  ];

  const SCROLLS = [
    { id: 'thunder', name: 'Thunder Parry', jp: '雷弾', desc: 'Perfect Parries shock nearby foes with lightning.' },
    { id: 'clone',   name: 'Shadow Clone',  jp: '影分身', desc: 'Flash-Step leaves an ink decoy that detonates.' },
    { id: 'drain',   name: 'Crimson Drain', jp: '紅吸', desc: 'Kills & Executions restore +12 extra HP.' },
    { id: 'iron',    name: 'Iron Posture',  jp: '鉄構', desc: '+45 Max Posture & faster posture recovery.' },
    { id: 'swift',   name: 'Swift Ki',      jp: '疾気', desc: '+40% Ki gain & faster passive spirit flow.' },
  ];

  const STORY_WAVES = [
    { stageIdx: 0, kanji: '第一幕', title: 'BAMBOO RAIN', sub: 'Ronin & Yari Spearman ambush in the storm.', list: ['ronin', 'spearman', 'ronin'] },
    { stageIdx: 1, kanji: '第二幕', title: 'BURNING TEMPLE', sub: 'Parry Teppo bullets back at the backline.', list: ['ronin', 'gunner', 'brute'] },
    { stageIdx: 2, kanji: '最終幕', title: 'LORD KUROGANE', sub: 'Demon of Ash — survive both phases.', list: ['boss'] },
  ];

  function get(idOrIdx) {
    if (typeof idOrIdx === 'number') {
      const i = Math.max(0, Math.min(WEAPONS.length - 1, idOrIdx | 0));
      return WEAPONS[i];
    }
    return BY_ID[idOrIdx] || WEAPONS[0];
  }

  function indexOf(idOrIdx) {
    if (typeof idOrIdx === 'number') return Math.max(0, Math.min(WEAPONS.length - 1, idOrIdx | 0));
    return BY_ID[idOrIdx] ? BY_ID[idOrIdx].index : 0;
  }

  function getSkillLabels(idOrIdx) {
    const w = get(idOrIdx);
    return {
      q: { name: w.skillQ.name, short: w.skillQ.short, cost: w.skillQ.cost },
      e: { name: w.skillE.name, short: w.skillE.short, cost: w.skillE.cost },
      r: { name: w.skillR.name, short: w.skillR.short, cost: w.skillR.cost },
    };
  }

  global.KuroWeapons = {
    WEAPONS,
    BY_ID,
    STAGES,
    SCROLLS,
    STORY_WAVES,
    get,
    indexOf,
    getSkillLabels,
  };
})(window);
