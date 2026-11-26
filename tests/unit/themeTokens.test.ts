import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  SIDELINE_CSS_TOKENS,
  SIDELINE_STANDARD_THEME_TOKENS,
  ermittleHoverAkzentFarbe,
  ermittleKontrastTextFarbe,
  ermittleTeamAkzentTokens,
  normalisiereHexFarbe,
} from '../../src/sdk/plugin.ts';

describe('PR1: Semantische Theme-Tokens & Team-Akzent-Helfer', () => {
  it('normalisiert gültige Hex-Farben (#RGB & #RRGGBB) und lehnt ungültige Werte ab', () => {
    assert.equal(normalisiereHexFarbe('#f59e0b'), '#F59E0B');
    assert.equal(normalisiereHexFarbe('  #abc  '), '#AABBCC');
    assert.equal(normalisiereHexFarbe('#1e3a8a'), '#1E3A8A');

    assert.equal(normalisiereHexFarbe(undefined), null);
    assert.equal(normalisiereHexFarbe(''), null);
    assert.equal(normalisiereHexFarbe('F59E0B'), null);
    assert.equal(normalisiereHexFarbe('#12345'), null);
    assert.equal(normalisiereHexFarbe('#GGGGGG'), null);
    assert.equal(normalisiereHexFarbe('rgb(255, 0, 0)'), null);
  });

  it('ermittelt kontrastreiche Textfarben (#0B0E11 vs #FFFFFF) nach WCAG-Luminanz', () => {
    assert.equal(ermittleKontrastTextFarbe('#F59E0B'), '#0B0E11');
    assert.equal(ermittleKontrastTextFarbe('#FDE68A'), '#0B0E11');
    assert.equal(ermittleKontrastTextFarbe('#FFFFFF'), '#0B0E11');

    assert.equal(ermittleKontrastTextFarbe('#1E3A8A'), '#FFFFFF');
    assert.equal(ermittleKontrastTextFarbe('#DC2626'), '#FFFFFF');
    assert.equal(ermittleKontrastTextFarbe('#0B0E11'), '#FFFFFF');
  });

  it('berechnet sinnvolle Hover-Farben für Standard-Amber, helle und dunkle Akzente', () => {
    assert.equal(ermittleHoverAkzentFarbe('#F59E0B'), '#FBBF24');
    assert.equal(ermittleHoverAkzentFarbe('#f59e0b'), '#FBBF24');

    const hoverBlau = ermittleHoverAkzentFarbe('#1E3A8A');
    assert.match(hoverBlau, /^#[0-9A-F]{6}$/);
    assert.notEqual(hoverBlau, '#1E3A8A');

    const hoverHell = ermittleHoverAkzentFarbe('#EAB308');
    assert.match(hoverHell, /^#[0-9A-F]{6}$/);
    assert.notEqual(hoverHell, '#EAB308');
  });

  it('liefert vollständige Team-Akzent-Tokens oder null bei fehlender/ungültiger Farbe', () => {
    assert.equal(ermittleTeamAkzentTokens(undefined), null);
    assert.equal(ermittleTeamAkzentTokens('ungueltig'), null);

    assert.deepEqual(ermittleTeamAkzentTokens('#f59e0b'), {
      '--sl-accent': '#F59E0B',
      '--sl-accent-hover': '#FBBF24',
      '--sl-accent-contrast': '#0B0E11',
    });

    const blauTokens = ermittleTeamAkzentTokens('#1E3A8A');
    assert.ok(blauTokens);
    assert.equal(blauTokens['--sl-accent'], '#1E3A8A');
    assert.equal(blauTokens['--sl-accent-contrast'], '#FFFFFF');
    assert.match(blauTokens['--sl-accent-hover'], /^#[0-9A-F]{6}$/);
  });

  it('hält alle semantischen --sl-*-Tokens synchron zwischen SDK und src/index.css', () => {
    const cssInhalt = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    const tokenKeys = Object.keys(SIDELINE_STANDARD_THEME_TOKENS);

    assert.equal(tokenKeys.length, Object.keys(SIDELINE_CSS_TOKENS).length);
    for (const cssVar of tokenKeys) {
      assert.ok(
        cssInhalt.includes(`${cssVar}:`),
        `Erwartete CSS-Variable ${cssVar} fehlt in src/index.css`
      );
    }

    for (const def of Object.values(SIDELINE_CSS_TOKENS)) {
      if ('tailwindColor' in def && def.tailwindColor) {
        assert.ok(
          cssInhalt.includes(`--color-${def.tailwindColor}:`),
          `Erwartetes Tailwind-@theme-Mapping --color-${def.tailwindColor} fehlt in src/index.css`
        );
      }
    }
  });
});
