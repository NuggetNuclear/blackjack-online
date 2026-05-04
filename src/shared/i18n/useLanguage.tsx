'use client';

import React, { createContext, useContext, ReactNode, useSyncExternalStore } from 'react';

export type Language = 'en' | 'es';

type Translations = typeof en;

const en = {
  common: {
    hit: 'HIT',
    stand: 'STAND',
    double: 'DOUBLE',
    split: 'SPLIT',
    surrender: 'SURRENDER',
    insurance: 'INSURANCE',
    back: 'Back',
    cancel: 'Cancel',
    confirm: 'Confirm',
    loading: 'Loading...',
    roomCode: 'Room Code',
    playerName: 'Your Name',
    balance: 'Balance',
    close: 'Close',
  },
  lobby: {
    title: '♠ ♥ Blackjack ♦ ♣',
    subtitle: 'Online Multiplayer',
    houseRules: 'House Rules',
    createRoom: 'Create Room',
    joinRoom: 'Join',
    joinSpectator: 'Join as Spectator',
    playSolo: 'Play Solo',
    insuranceRule: 'Insurance',
    surrenderRule: 'Surrender',
    orJoin: 'or join',
    or: 'or',
    portraitWarning: 'Rotate to landscape for multiplayer',
  },
  waiting: {
    title: 'Room Created!',
    copyLink: 'Copy Invite Link',
    linkCopied: 'Link Copied!',
    players: 'Players',
    startGame: 'Start Game!',
    startSolo: 'Start Solo While Waiting',
    tableLocked: 'Table Not Open',
    hostPrompt: 'You are the leader. Open the table when everyone is seated.',
    guestPrompt: 'The leader has not opened the table yet. Stay here until the room is ready.',
    spectatorPrompt: 'You are spectating for now. The leader will open the table when the room is ready.',
    leaderBadge: 'Leader',
    leaderSeat: 'Leader seat',
    seatConfirmed: 'Seat confirmed',
  },
  game: {
    dealer: 'Dealer',
    waitingForPlayers: 'Waiting for players...',
    waitingForHost: 'Waiting for host to start...',
    startGame: 'Start Game',
    betting: 'Place your bets',
    insurancePrompt: 'Insurance?',
    insuranceCost: 'Dealer shows an Ace. Cost: ',
    buyInsurance: 'Buy Insurance',
    decline: 'Decline',
    win: 'You Win!',
    lose: 'Dealer Wins',
    push: 'Push',
    blackjack: 'Blackjack!',
    bust: 'Bust!',
    waiting: 'Waiting...',
  },
  header: {
    title: 'Blackjack Online',
    copied: 'Copied',
    room: 'Room',
    leader: 'Leader',
    spectating: 'SPECTATING',
    spectate: 'Spectate',
    exit: 'Exit',
    exitConfirm: 'Leave the room?',
    exitConfirmWithBet: 'Leave the room? You will lose your current bet.',
    spectateConfirm: 'Switch to spectating?',
    spectateConfirmWithBet: 'Switch to spectating? You will lose your current bet.',
    settings: 'Settings',
    sound: 'Sound',
    edgeOffset: 'Edge Offset',
    edgeOff: 'EDGE: OFF',
    edgeMid: 'EDGE: MID',
    edgeHigh: 'EDGE: HIGH',
  },
  betting: {
    bet: 'Bet',
    undo: 'undo',
    allIn: 'ALL IN',
    deal: 'DEAL',
    clear: 'Clear',
    closesIn: 'Bets close in',
  },
  autoplay: {
    title: 'Autoplay',
    enabled: 'Enabled',
    disabled: 'Disabled',
    on: 'AUTO ON',
    off: 'AUTO',
    standOn: 'Stand on',
    autoBet: 'Auto-bet',
    manual: 'Manual',
    allIn: 'ALL IN',
    bettingLabel: 'Betting',
    standingAt: 'Standing at',
    queued: 'Autoplay queued for next round',
    active: 'AUTOPLAY',
  },
  table: {
    placeBets: 'Place Your Bets',
    playersTurn: 'Players Turn',
    dealerTurn: 'Dealer Turn',
    results: 'Results',
    blackjackPays: 'BLACKJACK PAYS 3 TO 2',
    dealerStands: 'DEALER MUST STAND ON ALL 17s',
    insurancePays: 'INSURANCE PAYS 2 TO 1',
    deck: 'DECK',
    joinGame: 'JOIN GAME',
  },
  results: {
    win: 'WIN!',
    lose: 'LOSE',
    push: 'PUSH',
    blackjack: 'BLACKJACK!',
    bust: 'BUST',
    bj: 'BJ!',
  },
  controls: {
    waitingForPlayers: 'Waiting for other players...',
    newRound: 'New Round',
    nextRoundIn: 'Next round in',
    waitingForNewRound: 'Waiting for new round...',
  },
  history: {
    title: 'History',
    empty: 'No history yet',
  },
  seats: {
    ready: 'Ready',
    betting: 'Betting...',
    joiningNextRound: 'Next round',
  },
};

const es: Translations = {
  common: {
    hit: 'PEDIR',
    stand: 'PLANTARSE',
    double: 'DOBLAR',
    split: 'DIVIDIR',
    surrender: 'RENDIRSE',
    insurance: 'SEGURO',
    back: 'Volver',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    loading: 'Cargando...',
    roomCode: 'Código de Sala',
    playerName: 'Tu Nombre',
    balance: 'Saldo',
    close: 'Cerrar',
  },
  lobby: {
    title: '♠ ♥ Blackjack ♦ ♣',
    subtitle: 'Multijugador Online',
    houseRules: 'Reglas de la Casa',
    createRoom: 'Crear Sala',
    joinRoom: 'Unirse',
    joinSpectator: 'Entrar como Espectador',
    playSolo: 'Jugar Solo',
    insuranceRule: 'Seguro',
    surrenderRule: 'Rendirse',
    orJoin: 'o unirse',
    or: 'o',
    portraitWarning: 'Gira a horizontal para multijugador',
  },
  waiting: {
    title: '¡Sala Creada!',
    copyLink: 'Copiar Enlace',
    linkCopied: '¡Enlace Copiado!',
    players: 'Jugadores',
    startGame: '¡Empezar Juego!',
    startSolo: 'Jugar Solo mientras esperas',
    tableLocked: 'Mesa Cerrada',
    hostPrompt: 'Eres el líder. Abre la mesa cuando todos estén sentados.',
    guestPrompt: 'El líder todavía no abre la mesa. Espera aquí hasta que la sala esté lista.',
    spectatorPrompt: 'Por ahora estás observando. El líder abrirá la mesa cuando la sala esté lista.',
    leaderBadge: 'Líder',
    leaderSeat: 'Asiento líder',
    seatConfirmed: 'Asiento confirmado',
  },
  game: {
    dealer: 'Crupier',
    waitingForPlayers: 'Esperando jugadores...',
    waitingForHost: 'Esperando al anfitrión...',
    startGame: 'Empezar Juego',
    betting: 'Hagan sus apuestas',
    insurancePrompt: '¿Seguro?',
    insuranceCost: 'El Crupier tiene un As. Costo: ',
    buyInsurance: 'Comprar Seguro',
    decline: 'Rechazar',
    win: '¡Ganaste!',
    lose: 'Gana el Crupier',
    push: 'Empate',
    blackjack: '¡Blackjack!',
    bust: '¡Bust!',
    waiting: 'Esperando...',
  },
  header: {
    title: 'Blackjack Online',
    copied: 'Copiado',
    room: 'Sala',
    leader: 'Líder',
    spectating: 'ESPECTADOR',
    spectate: 'Observar',
    exit: 'Salir',
    exitConfirm: '¿Salir de la sala?',
    exitConfirmWithBet: '¿Salir de la sala? Perderás tu apuesta actual.',
    spectateConfirm: '¿Pasar a modo espectador?',
    spectateConfirmWithBet: '¿Pasar a modo espectador? Perderás tu apuesta actual.',
    settings: 'Ajustes',
    sound: 'Sonido',
    edgeOffset: 'Margen',
    edgeOff: 'BORDE: NO',
    edgeMid: 'BORDE: MED',
    edgeHigh: 'BORDE: MAX',
  },
  betting: {
    bet: 'Apuesta',
    undo: 'quitar',
    allIn: 'TODO',
    deal: 'REPARTIR',
    clear: 'Limpiar',
    closesIn: 'Apuestas cierran en',
  },
  autoplay: {
    title: 'Auto-juego',
    enabled: 'Activado',
    disabled: 'Desactivado',
    on: 'AUTO ON',
    off: 'AUTO',
    standOn: 'Plantar en',
    autoBet: 'Apuesta auto',
    manual: 'Manual',
    allIn: 'TODO',
    bettingLabel: 'Apostando',
    standingAt: 'Plantando en',
    queued: 'Auto-juego en la próxima ronda',
    active: 'AUTO-JUEGO',
  },
  table: {
    placeBets: 'Hagan Sus Apuestas',
    playersTurn: 'Turno del Jugador',
    dealerTurn: 'Turno del Crupier',
    results: 'Resultados',
    blackjackPays: 'BLACKJACK PAGA 3 A 2',
    dealerStands: 'CRUPIER SE PLANTA EN TODOS LOS 17',
    insurancePays: 'SEGURO PAGA 2 A 1',
    deck: 'MAZO',
    joinGame: 'UNIRSE',
  },
  results: {
    win: '¡GANÓ!',
    lose: 'PERDIÓ',
    push: 'EMPATE',
    blackjack: '¡BLACKJACK!',
    bust: 'PASADO',
    bj: 'BJ!',
  },
  controls: {
    waitingForPlayers: 'Esperando a otros jugadores...',
    newRound: 'Nueva Ronda',
    nextRoundIn: 'Siguiente ronda en',
    waitingForNewRound: 'Esperando nueva ronda...',
  },
  history: {
    title: 'Historial',
    empty: 'Sin historial',
  },
  seats: {
    ready: 'Listo',
    betting: 'Apostando...',
    joiningNextRound: 'Siguiente ronda',
  },
};

const translations = { en, es };
const LANGUAGE_STORAGE_KEY = 'bj_lang';
const LANGUAGE_EVENT = 'bj-language-change';

function getStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'es';
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return saved === 'en' || saved === 'es' ? saved : 'es';
}

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleChange = () => callback();
  window.addEventListener('storage', handleChange);
  window.addEventListener(LANGUAGE_EVENT, handleChange);

  return () => {
    window.removeEventListener('storage', handleChange);
    window.removeEventListener(LANGUAGE_EVENT, handleChange);
  };
}

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore<Language>(subscribe, getStoredLanguage, () => 'es');

  const handleSetLanguage = (lang: Language) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
