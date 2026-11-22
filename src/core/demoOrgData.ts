import type {
  BenutzerKonto,
  S3Konfiguration,
  SmtpKonfiguration,
  TeamEinladung,
  TeamKontext,
  TeamMitgliedschaft,
} from '../shared/types.ts';

export const INITIALE_TEAMS: TeamKontext[] = [
  {
    id: 'team-stallions-seniors',
    name: 'Munich Stallions',
    kurzname: 'Seniors',
    aktiveSaison: '2026',
    saisons: ['2026', '2025', '2024'],
    primaerFarbe: '#F59E0B',
    aktivierteModule: [],
    customProfilFelder: [
      { key: 'passnummer', label: 'Spielerpass-Nr.', typ: 'text', pflicht: false },
      { key: 'notfallkontakt', label: 'Notfallkontakt (Name & Tel.)', typ: 'text', pflicht: true },
      {
        key: 'trikotgroesse',
        label: 'Jersey-Größe',
        typ: 'select',
        optionen: ['S', 'M', 'L', 'XL', 'XXL', '3XL'],
      },
    ],
  },
  {
    id: 'team-stallions-u19',
    name: 'Munich Stallions U19',
    kurzname: 'U19',
    aktiveSaison: '2026',
    saisons: ['2026', '2025'],
    primaerFarbe: '#3B82F6',
    aktivierteModule: [],
    customProfilFelder: [
      {
        key: 'notfallkontakt',
        label: 'Erziehungsberechtigte / Notfallkontakt',
        typ: 'text',
        pflicht: true,
      },
    ],
  },
];

export const INITIALE_BENUTZER: BenutzerKonto[] = [
  {
    uuid: 'usr-0001-headcoach',
    benutzername: 'm.brenner',
    vollerName: 'Markus Brenner',
    email: 'headcoach@stallions-football.de',
    telefon: '+49 170 4412890',
    trikotNummer: '',
    position: 'Head Coach',
    istSysadmin: true,
    erstelltAm: '2026-01-10',
    customProfilWerte: {
      notfallkontakt: 'Sabine Brenner (+49 170 9911220)',
      trikotgroesse: 'XL',
    },
  },
  {
    uuid: 'usr-0002-oc',
    benutzername: 't.richter',
    vollerName: 'Tobias Richter',
    email: 'oc@stallions-football.de',
    telefon: '+49 171 5523104',
    trikotNummer: '',
    position: 'Offensive Coordinator',
    istSysadmin: false,
    erstelltAm: '2026-01-14',
    customProfilWerte: {
      trikotgroesse: 'L',
    },
  },
  {
    uuid: 'usr-0003-wr',
    benutzername: 'l.weber',
    vollerName: 'Lukas Weber',
    email: 'lukas.weber@stallions-football.de',
    telefon: '+49 176 8832194',
    trikotNummer: '14',
    position: 'WR / CB',
    istSysadmin: false,
    erstelltAm: '2026-02-02',
    customProfilWerte: {
      passnummer: 'AFVD-BY-2026-0148',
      notfallkontakt: 'Thomas Weber (+49 176 1122334)',
      trikotgroesse: 'L',
    },
  },
  {
    uuid: 'usr-0004-sysop',
    benutzername: 'sysadmin',
    vollerName: 'Jonas Keller (IT)',
    email: 'ops@stallions-football.de',
    istSysadmin: true,
    erstelltAm: '2026-01-01',
    customProfilWerte: {},
  },
  {
    uuid: 'usr-0005-pending',
    benutzername: 'j.huber',
    vollerName: 'Janik Huber',
    email: 'janik.huber@example.de',
    telefon: '+49 151 7742091',
    trikotNummer: '54',
    position: 'LB / FB',
    istSysadmin: false,
    erstelltAm: '2026-11-18',
    customProfilWerte: {
      notfallkontakt: 'Petra Huber (+49 151 7742099)',
      trikotgroesse: 'XL',
    },
  },
];

export const INITIALE_MITGLIEDSCHAFTEN: TeamMitgliedschaft[] = [
  {
    id: 'mem-1',
    userUuid: 'usr-0001-headcoach',
    teamId: 'team-stallions-seniors',
    rolle: 'TEAM_ADMIN',
    units: ['OFFENSE', 'DEFENSE', 'SPECIAL_TEAMS'],
    status: 'AKTIV',
    beigetretenAm: '2026-01-10',
  },
  {
    id: 'mem-2',
    userUuid: 'usr-0002-oc',
    teamId: 'team-stallions-seniors',
    rolle: 'COACH',
    units: ['OFFENSE'],
    status: 'AKTIV',
    beigetretenAm: '2026-01-14',
  },
  {
    id: 'mem-3',
    userUuid: 'usr-0003-wr',
    teamId: 'team-stallions-seniors',
    rolle: 'PLAYER',
    units: ['OFFENSE', 'DEFENSE', 'SPECIAL_TEAMS'],
    status: 'AKTIV',
    beigetretenAm: '2026-02-02',
  },
  {
    id: 'mem-4',
    userUuid: 'usr-0005-pending',
    teamId: 'team-stallions-seniors',
    rolle: 'PLAYER',
    units: ['DEFENSE'],
    status: 'WARTET_AUF_FREIGABE',
    beigetretenAm: '2026-11-18',
  },
  {
    id: 'mem-5',
    userUuid: 'usr-0001-headcoach',
    teamId: 'team-stallions-u19',
    rolle: 'TEAM_ADMIN',
    units: ['OFFENSE', 'DEFENSE'],
    status: 'AKTIV',
    beigetretenAm: '2026-01-12',
  },
];

export const INITIALE_EINLADUNGEN: TeamEinladung[] = [
  {
    id: 'inv-1',
    teamId: 'team-stallions-seniors',
    typ: 'TEAM_LINK',
    rolle: 'PLAYER',
    units: ['OFFENSE'],
    token: 'team-seniors-2026-x9k2',
    pfad: '/invite/team-seniors-2026-x9k2',
    erstelltAm: '2026-11-10',
    gueltigBis: '2026-12-31',
    bestaetigungErforderlich: true,
    aktiv: true,
  },
  {
    id: 'inv-2',
    teamId: 'team-stallions-seniors',
    typ: 'EMAIL',
    zielEmail: 'dc-neu@stallions-football.de',
    rolle: 'COACH',
    units: ['DEFENSE'],
    token: 'mail-dc-7a4p1m',
    pfad: '/invite/mail-dc-7a4p1m',
    erstelltAm: '2026-11-17',
    gueltigBis: '2026-11-24',
    bestaetigungErforderlich: false,
    aktiv: true,
  },
];

export const INITIALE_S3_KONFIG: S3Konfiguration = {
  endpoint: 'https://s3.eu-central-1.vereinscloud.example',
  region: 'eu-central-1',
  bucket: 'sidelineos-prod',
  accessKey: 'SLOS_AK_DEMO_9281',
  forcePathStyle: true,
};

export const INITIALE_SMTP_KONFIG: SmtpKonfiguration = {
  host: 'smtp.vereinsmail.example',
  port: 587,
  absender: 'SidelineOS <noreply@stallions-football.de>',
  benutzer: 'noreply@stallions-football.de',
  tlsAktiv: true,
};
