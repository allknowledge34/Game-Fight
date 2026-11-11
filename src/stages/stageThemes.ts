import type { StageId } from '../core/types';

export interface StageTheme {
  id: StageId;
  label: string;
  skyTop: number;
  skyMid: number;
  skyHorizon: number;
  fog: number;
  sunColor: number;
  sunIntensity: number;
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
    skyTop: 0x160a2e,
    skyMid: 0x5c2046,
    skyHorizon: 0xd96838,
    fog: 0x3b1838,
    sunColor: 0xffb36b,
    sunIntensity: 1.9,
    hemiTop: 0xffc09a,
    hemiBottom: 0x452822,
    hemiIntensity: 0.9,
    floorPrimary: '#8c3b2f',
    floorSecondary: '#d9c4b0',
  },
  jantar: {
    id: 'jantar',
    label: 'JANTAR MANTAR',
    skyTop: 0x204d8c,
    skyMid: 0x629cd4,
    skyHorizon: 0xf0c994,
    fog: 0xa0b4cc,
    sunColor: 0xffe4b8,
    sunIntensity: 2.2,
    hemiTop: 0xdcf0ff,
    hemiBottom: 0x7a4a35,
    hemiIntensity: 1.05,
    floorPrimary: '#a63b2d',
    floorSecondary: '#eadfc8',
  },
  road: {
    id: 'road',
    label: 'DESI SADAK',
    skyTop: 0x2d415c,
    skyMid: 0x6d6a78,
    skyHorizon: 0xc29268,
    fog: 0x6b5c58,
    sunColor: 0xffd194,
    sunIntensity: 1.85,
    hemiTop: 0xe6d4be,
    hemiBottom: 0x403b38,
    hemiIntensity: 0.95,
    floorPrimary: '#303238',
    floorSecondary: '#464952',
  },
};
