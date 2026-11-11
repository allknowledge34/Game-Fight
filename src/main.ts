import './styles/main.css';
import { GameApp } from './game/GameApp';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Required canvas #game missing from document');
}

const app = new GameApp(canvas);
(window as unknown as { __GAME_APP__?: GameApp }).__GAME_APP__ = app;
