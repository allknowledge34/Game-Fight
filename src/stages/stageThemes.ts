import type { StageId } from '../core/types';

export interface StageTheme {
  id: StageId;
  label: string;
  skyTop: number;
  skyMid: number;
  skyHorizon: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sunColor: number;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiTop: number;
  hemiBottom: number;
  hemiIntensity: number;
  floorPrimary: string;
  floorSecondary: string;
}

export const STAGE_THEMES: Record<StageId, StageTheme> = {
  sansad: {
    id: 'sansad',
    label: 'SANSAD BHAVAN',
    skyTop: 0x1b2a5a,
    skyMid: 0xe86f3c,
    skyHorizon: 0xffc663,
    fog: 0xe9a366,
    fogNear: 28,
    fogFar: 82,
    sunColor: 0xffd2a0,
    sunIntensity: 2.6,
    sunPos: [-6, 12, 9],
    hemiTop: 0xffde80,
    hemiBottom: 0x623b2a,
    hemiIntensity: 1.25,
    floorPrimary: '#e9dcc3',
    floorSecondary: '#b8805a',
  },
  jantar: {
    id: 'jantar',
    label: 'JANTAR MANTAR',
    skyTop: 0x2f6fa4,
    skyMid: 0x93c1ea,
    skyHorizon: 0xf2df80,
    fog: 0xc2d5e8,
    fogNear: 30,
    fogFar: 90,
    sunColor: 0xfff5d6,
    sunIntensity: 2.45,
    sunPos: [7, 16, 10],
    hemiTop: 0xdff2ff,
    hemiBottom: 0x7a4a35,
    hemiIntensity: 1.15,
    floorPrimary: '#b84334',
    floorSecondary: '#eddcc2',
  },
  road: {
    id: 'road',
    label: 'DESI SADAK',
    skyTop: 0x7fa3c4,
    skyMid: 0xd8c9c2,
    skyHorizon: 0xeac0a6,
    fog: 0xbda79d,
    fogNear: 26,
    fogFar: 82,
    sunColor: 0xffe4b8,
    sunIntensity: 2.05,
    sunPos: [-8, 14, 9],
    hemiTop: 0xf0dfd0,
    hemiBottom: 0x4b4642,
    hemiIntensity: 1.08,
    floorPrimary: '#4b4945',
    floorSecondary: '#3b3935',
  },
};
