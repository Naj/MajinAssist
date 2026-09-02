// MAJIN — Relais RSS2JSON. /api/majin/rss/* → https://api.rss2json.com/v1/*
import { relais } from '../_relais.js';
export const onRequest = relais('https://api.rss2json.com/v1');
