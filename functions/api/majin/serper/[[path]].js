// MAJIN — Relais Serper. /api/majin/serper/* → https://google.serper.dev/*
// L'en-tête X-API-KEY est transmis tel quel.
import { relais } from '../_relais.js';
export const onRequest = relais('https://google.serper.dev');
