import { mount } from 'svelte';
import 'uplot/dist/uPlot.min.css';
import './lib/styles/app-shell.css';
import SignalLabApp from './SignalLabApp.svelte';

const app = mount(SignalLabApp, { target: document.getElementById('app')! });

export default app;
