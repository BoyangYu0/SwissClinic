import { describe, expect, it } from "vitest";
import {
  monthsBetweenObservedAndTarget,
  parseDurationWeeks,
  parseLeadTimeMonths,
  parseMonthExpression,
} from "../src/date.js";

describe("date parsing utilities", () => {
  it.each([
    ["ab Juli 2027", "2027-07"],
    ["ab 01.07.2027", "2027-07-01"],
    ["ab dem 1.7.2027", "2027-07-01"],
    ["ab März 2028", "2028-03"],
    ["ab Maerz 2028", "2028-03"],
    ["keine freien Plätze bis Ende 2026", "2026-12"],
    ["ausgebucht bis Dezember 2027", "2027-12"],
    ["dès juillet 2027", "2027-07"],
    ["à partir de juillet 2027", "2027-07"],
    ["à partir du 01.07.2027", "2027-07-01"],
    ["complet jusqu'à fin 2026", "2026-12"],
    ["aucune place disponible jusqu'en décembre 2027", "2027-12"],
    ["dès août 2028", "2028-08"],
    ["da luglio 2027", "2027-07"],
    ["a partire da luglio 2027", "2027-07"],
    ["a partire dal 01.07.2027", "2027-07-01"],
    ["occupato fino a fine 2026", "2026-12"],
    ["nessun posto disponibile fino a dicembre 2027", "2027-12"],
    ["da dicembre 2028", "2028-12"],
    ["from September 2029", "2029-09"],
    ["fully booked until November 2027", "2027-11"],
    ["available from 15.09.2028", "2028-09-15"],
  ])("parses month/date phrase %s", (phrase, expected) => {
    expect(parseMonthExpression(phrase)).toBe(expected);
  });

  it.each([
    "ab sofort",
    "nach Vereinbarung",
    "Bewerbungen 12 Monate im Voraus",
    "Bewerbungsfrist bis Ende 2026",
    "application deadline 01.07.2027",
    "date limite de candidature juillet 2027",
    "scadenza candidatura luglio 2027",
    "ab 31.02.2027",
  ])("does not parse non-availability date phrase %s", (phrase) => {
    expect(parseMonthExpression(phrase)).toBeNull();
  });

  it.each([
    ["Bewerbungen 12 Monate im Voraus", 12],
    ["Bewerbungen ein Jahr im Voraus", 12],
    ["Bewerbungen 18 Monate im Voraus", 18],
    ["mindestens 6 Monate vorher bewerben", 6],
    ["Bewerbungen frühestens 12 Monate vor Beginn", 12],
    ["Bewerbungen spaetestens 18 Monate vor Start", 18],
    ["candidature 12 mois à l'avance", 12],
    ["candidature 3 mois avant", 3],
    ["candidature 18 mois avant le début", 18],
    ["postulation un an à l'avance", 12],
    ["candidatura con 12 mesi di anticipo", 12],
    ["candidatura 4 mesi prima", 4],
    ["candidatura 18 mesi prima dell'inizio", 18],
    ["candidatura un anno di anticipo", 12],
    ["un anno prima", 12],
    ["applications 9 months in advance", 9],
    ["apply one year in advance", 12],
  ])("parses lead time phrase %s", (phrase, expected) => {
    expect(parseLeadTimeMonths(phrase)).toBe(expected);
  });

  it.each([
    "Bewerbungen laufend möglich",
    "ab Juli 2027",
    "ohne Vorlauf",
    "nach Vereinbarung",
  ])("returns null when lead time is absent in %s", (phrase) => {
    expect(parseLeadTimeMonths(phrase)).toBeNull();
  });

  it.each([
    ["für mindestens 4 Wochen", { minWeeks: 4, maxWeeks: null }],
    ["mindestens 2 Monate", { minWeeks: 8, maxWeeks: null }],
    ["1 bis 4 Monate", { minWeeks: 4, maxWeeks: 16 }],
    ["4 bis 8 Wochen", { minWeeks: 4, maxWeeks: 8 }],
    ["1-3 Monate", { minWeeks: 4, maxWeeks: 12 }],
    ["2 Monate", { minWeeks: 8, maxWeeks: 8 }],
    ["4 Wochen", { minWeeks: 4, maxWeeks: 4 }],
    ["au moins 6 semaines", { minWeeks: 6, maxWeeks: null }],
    ["1 a 3 mois", { minWeeks: 4, maxWeeks: 12 }],
    ["almeno 2 mesi", { minWeeks: 8, maxWeeks: null }],
    ["2 a 6 settimane", { minWeeks: 2, maxWeeks: 6 }],
    ["at least 5 weeks", { minWeeks: 5, maxWeeks: null }],
    ["1 to 4 months", { minWeeks: 4, maxWeeks: 16 }],
    ["während 1 – 4 Monaten im Spitalalltag", { minWeeks: 4, maxWeeks: 16 }],
    ["zwischen einem und vier Monaten", { minWeeks: 4, maxWeeks: 16 }],
    ["Mindestzeitraum von drei bis vier Monaten", { minWeeks: 12, maxWeeks: 16 }],
    ["Zeitraum von 2-4 Monaten", { minWeeks: 8, maxWeeks: 16 }],
    ["Unterassistenzstellen ab einem Monat", { minWeeks: 4, maxWeeks: null }],
    ["ProgrammdauerAb einem Monat", { minWeeks: 4, maxWeeks: null }],
    ["Programmdauer1-4 Monate", { minWeeks: 4, maxWeeks: 16 }],
    ["ProgrammdauerAb einem MonatProgrammleitungPD Dr.", { minWeeks: 4, maxWeeks: null }],
    ["Programmdauer1-4 MonateProgrammleitungDr.", { minWeeks: 4, maxWeeks: 16 }],
    ["Dauer von einem, zwei, drei oder vier Monaten", { minWeeks: 4, maxWeeks: 16 }],
    ["Dauer von drei Monaten", { minWeeks: 12, maxWeeks: 12 }],
    ["ein 2-4 monatiges Curriculum", { minWeeks: 8, maxWeeks: 16 }],
    ["Dauer von zwei bis vier Monaten", { minWeeks: 8, maxWeeks: 16 }],
  ])("parses duration phrase %s", (phrase, expected) => {
    expect(parseDurationWeeks(phrase)).toEqual(expected);
  });

  it.each([
    "Dauer nach Vereinbarung",
    "Bewerbungen 12 Monate im Voraus",
    "ab Juli 2027",
  ])("returns null duration when no duration is present in %s", (phrase) => {
    expect(parseDurationWeeks(phrase)).toEqual({ minWeeks: null, maxWeeks: null });
  });

  it.each([
    ["2026-07-07T08:00:00.000Z", "2027-07", 12],
    ["2026-07-31T23:00:00.000Z", "2026-08", 1],
    ["2026-07-07T08:00:00.000Z", "2026-06", -1],
    ["2026-07-07T08:00:00.000Z", "2027-07-01", 12],
  ])("calculates observed months between %s and %s", (observedAt, target, expected) => {
    expect(monthsBetweenObservedAndTarget(observedAt, target)).toBe(expected);
  });

  it("returns null for invalid observed month calculations", () => {
    expect(monthsBetweenObservedAndTarget("not-a-date", "2027-07")).toBeNull();
    expect(monthsBetweenObservedAndTarget("2026-07-07T08:00:00.000Z", "July 2027")).toBeNull();
  });
});
