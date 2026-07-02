import '@fontsource/lilita-one';
import '@fontsource/baloo-2/400.css';
import '@fontsource/baloo-2/600.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
import './ui/styles.css';
import { Game } from './game/game';

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app container');
new Game(app);
