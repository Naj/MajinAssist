// MAJIN — Relais Groq. /api/majin/groq/* → https://api.groq.com/*
// L'en-tête Authorization envoyé par le navigateur est transmis tel quel :
// la clé reste celle de l'utilisateur, le proxy n'en détient aucune.
import { relais } from '../_relais.js';
export const onRequest = relais('https://api.groq.com');
