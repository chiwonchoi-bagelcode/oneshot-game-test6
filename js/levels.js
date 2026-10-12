/* 다리야, 가지 마! — stage data
 * World units, y grows downward, the usual floor top is y = 0.
 * platform: {x, y(top), w, h?, kind}; hazard: hanging cream {x, y, w, h};
 * goal: {x0, x1, y}  both shoes inside & cake calm -> delivered.
 */
(function (root) {
  'use strict';

  const LEVELS = [
    {
      id: 1,
      name: '첫 배달',
      sub: '밀고, 갈아타고, 디디기',
      customer: 'bear',
      start: { feet: [[0, 0], [70, 0]], fluid: [5, 5], pool: 0 },
      platforms: [
        { x: -260, y: 0, w: 440, kind: 'biscuit' },
        { x: 240, y: -12, w: 260, kind: 'table' },
      ],
      goal: { x0: 280, x1: 460, y: -12 },
      tutorial: true,
    },
    {
      id: 2,
      name: '쿠키 징검다리',
      sub: '틈이 넓을수록 앞발 너머까지 밀고 갈아타요',
      customer: 'rabbit',
      start: { feet: [[0, 0], [70, 0]], fluid: [5, 5], pool: 0 },
      platforms: [
        { x: -240, y: 0, w: 390, kind: 'biscuit' },
        { x: 210, y: 0, w: 110, kind: 'choco' },
        { x: 400, y: 0, w: 110, kind: 'biscuit' },
        { x: 645, y: 0, w: 290, kind: 'table' },
      ],
      checkpoints: [{ id: 'c1', x0: 400, x1: 510 }],
      goal: { x0: 675, x1: 905, y: 0 },
    },
    {
      id: 3,
      name: '웨하스 계단',
      sub: '높은 곳은 긴 다리로, 낮은 곳은 천천히',
      customer: 'cat',
      start: { feet: [[0, 0], [70, 0]], fluid: [5, 5], pool: 0 },
      platforms: [
        { x: -240, y: 0, w: 370, kind: 'wafer' },
        { x: 130, y: -34, w: 120, kind: 'wafer' },
        { x: 250, y: -68, w: 120, kind: 'wafer' },
        { x: 440, y: -28, w: 110, kind: 'sponge' },
        { x: 620, y: 6, w: 280, kind: 'table' },
      ],
      checkpoints: [{ id: 'c1', x0: 250, x1: 370 }],
      goal: { x0: 650, x1: 870, y: 6 },
    },
    {
      id: 4,
      name: '마카롱 기둥',
      sub: '좁은 기둥엔 한 발씩만 디딜 수 있어요',
      customer: 'dog',
      start: { feet: [[0, 0], [70, 0]], fluid: [5, 5], pool: 0 },
      platforms: [
        { x: -240, y: 0, w: 370, kind: 'biscuit' },
        { x: 196, y: -8, w: 44, kind: 'macaron' },
        { x: 300, y: 4, w: 44, kind: 'macaron' },
        { x: 410, y: -14, w: 120, kind: 'choco' },
        { x: 598, y: -4, w: 44, kind: 'macaron' },
        { x: 712, y: -12, w: 290, kind: 'table' },
      ],
      checkpoints: [{ id: 'c1', x0: 410, x1: 530 }],
      goal: { x0: 742, x1: 970, y: -12 },
    },
    {
      id: 5,
      name: '휘핑 동굴',
      sub: '천장 크림에 케이크가 닿지 않게 몸을 낮춰요',
      customer: 'owl',
      start: { feet: [[0, 0], [80, 0]], fluid: [4, 4], pool: 2 },
      platforms: [
        { x: -240, y: 0, w: 420, kind: 'sponge' },
        { x: 245, y: 0, w: 180, kind: 'sponge' },
        { x: 490, y: 12, w: 160, kind: 'choco' },
        { x: 720, y: -6, w: 290, kind: 'table' },
      ],
      hazards: [
        { x: 150, y: -440, w: 150, h: 228 },
        { x: 350, y: -440, w: 130, h: 236 },
        { x: 540, y: -440, w: 130, h: 222 },
      ],
      checkpoints: [{ id: 'c1', x0: 490, x1: 650 }],
      goal: { x0: 750, x1: 980, y: -6 },
    },
    {
      id: 6,
      name: '생일 파티',
      sub: '지금까지 배운 걸 모두 모아서',
      customer: 'party',
      start: { feet: [[0, 0], [70, 0]], fluid: [5, 5], pool: 0 },
      platforms: [
        { x: -240, y: 0, w: 370, kind: 'biscuit' },
        { x: 195, y: -30, w: 110, kind: 'wafer' },
        { x: 370, y: -58, w: 44, kind: 'macaron' },
        { x: 480, y: -24, w: 130, kind: 'sponge' },
        { x: 690, y: 0, w: 130, kind: 'choco' },
        { x: 890, y: 12, w: 44, kind: 'macaron' },
        { x: 1000, y: -18, w: 150, kind: 'biscuit' },
        { x: 1225, y: -34, w: 300, kind: 'table' },
      ],
      hazards: [
        { x: 670, y: -440, w: 170, h: 236 },
      ],
      checkpoints: [{ id: 'c1', x0: 480, x1: 610 }, { id: 'c2', x0: 1000, x1: 1150 }],
      goal: { x0: 1255, x1: 1495, y: -34 },
    },
  ];

  root.LEVELS = LEVELS;
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
