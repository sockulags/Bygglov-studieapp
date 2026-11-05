// Parameter schemas for generated drawings (`parametrar` on a handling with an .svg file).
// Keys are Swedish without å, ä and ö, like the rest of content/. Coordinates are metres:
// x grows to the east, y grows to the south, and the origin is the north-west corner of the
// plot (situationsplan) or any fixed point the author chooses (planritning, plankarta).
import { z } from 'zod';
import { fieldError, isoDate, text } from '@bygglov/content-schema';

const number = (message: string) => z.number({ error: fieldError(message) });

/** A length in metres, greater than zero. */
const length = number('Ska vara ett tal i meter (punkt som decimaltecken, t.ex. 12.5).').positive({
  error: fieldError('Ska vara större än 0.'),
});

/** A coordinate in metres. */
const coordinate = number('Ska vara en koordinat i meter (punkt som decimaltecken, t.ex. 6.5).');

const nonNegative = number('Ska vara ett tal i meter.').nonnegative({
  error: fieldError('Får inte vara negativt.'),
});

/** `[x, y, bredd, djup]` in metres. */
export const rectangle = z.tuple([coordinate, coordinate, length, length], {
  error: fieldError('Ska vara en rektangel [x, y, bredd, djup] i meter, t.ex. [6, 13, 12.5, 8].'),
});
export type Rectangle = z.output<typeof rectangle>;

/** `[x, y]` in metres. */
export const point = z.tuple([coordinate, coordinate], {
  error: fieldError('Ska vara en punkt [x, y] i meter, t.ex. [8, 24].'),
});
export type Point = z.output<typeof point>;

export const SIDES = ['norr', 'oster', 'soder', 'vaster'] as const;
export const side = z.enum(SIDES, {
  error: fieldError(`Ska vara ett väderstreck: ${SIDES.join(', ')}.`),
});
export type Side = z.output<typeof side>;

/** Scale denominator: 500 means 1:500. */
const scale = (fallback: number) =>
  z
    .number({ error: fieldError('skala anges som skaltalet, t.ex. 500 för 1:500.') })
    .int({ error: fieldError('skala ska vara ett heltal, t.ex. 100 eller 500.') })
    .min(20, { error: fieldError('skala ska vara minst 20 (1:20).') })
    .max(5000, { error: fieldError('skala får vara högst 5000 (1:5000).') })
    .default(fallback);

/** Title block overrides. Defaults come from the case and the handling. */
export const TitleBlockSchema = z.strictObject({
  /** Defaults to the case's `fastighet`. */
  fastighet: text.optional(),
  /** Project line, defaults to the case title. */
  projekt: text.optional(),
  /** Drawing type, defaults to the kind of drawing (Situationsplan, Fasader …). */
  ritningstyp: text.optional(),
  /** Drawing date, defaults to the handling's `inkom` or the case start date. */
  datum: isoDate.optional(),
  ritningsnummer: text.optional(),
  ritad_av: text.optional(),
});
export type TitleBlockParams = z.output<typeof TitleBlockSchema>;

const titleBlock = TitleBlockSchema.optional();

/** A strip along one side of the plot, e.g. prickmark 6 m from the southern boundary. */
export const ZoneSchema = z.strictObject({
  sida: side,
  djup: length,
});
export type Zone = z.output<typeof ZoneSchema>;

const inside = (r: Rectangle, width: number, depth: number, tolerance = 1e-9) =>
  r[0] >= -tolerance &&
  r[1] >= -tolerance &&
  r[0] + r[2] <= width + tolerance &&
  r[1] + r[3] <= depth + tolerance;

// ---------------------------------------------------------------------------------------------
// Situationsplan

export const SituationsplanSchema = z
  .strictObject({
    skala: scale(500),
    tomt_bredd: length,
    tomt_djup: length,
    /** Label inside the plot. Defaults to the first part of the case's `fastighet`. */
    fastighet: text.optional(),
    /** Existing main building. Either `hus` or `nybyggnad` is required. */
    hus: rectangle.optional(),
    /** New main building on the plot, e.g. a new house on an empty plot. */
    nybyggnad: rectangle.optional(),
    /** New extension. */
    tillbyggnad: rectangle.optional(),
    /** New outbuilding. */
    komplementbyggnad: rectangle.optional(),
    /** Label of the new outbuilding, e.g. "Nytt miljöhus". Defaults to "Ny komplementbyggnad". */
    komplementbyggnad_namn: text.optional(),
    /**
     * Label of the main building (`hus` or `nybyggnad`), e.g. "Nytt flerbostadshus". Defaults to
     * "Befintligt bostadshus" or "Nytt bostadshus".
     */
    huvudbyggnad_namn: text.optional(),
    /** Other existing buildings on the plot, e.g. a garage. */
    ovriga_byggnader: z
      .array(z.strictObject({ rektangel: rectangle, namn: text.optional() }), {
        error: fieldError('ovriga_byggnader ska vara en lista med { rektangel, namn }.'),
      })
      .default([]),
    /**
     * Built without permit or in breach of it (supervision cases): cross-hatched, measured to
     * the boundaries and labelled with `namn`.
     */
    avvikelse: z
      .array(z.strictObject({ rektangel: rectangle, namn: text.optional() }), {
        error: fieldError('avvikelse ska vara en lista med { rektangel, namn }.'),
      })
      .default([]),
    /** What the granted permit allows, drawn as a dash-dot outline on top of the buildings. */
    lovgivet: z
      .array(z.strictObject({ rektangel: rectangle, namn: text.optional() }), {
        error: fieldError('lovgivet ska vara en lista med { rektangel, namn }.'),
      })
      .default([]),
    prickmark: z
      .array(ZoneSchema, {
        error: fieldError('prickmark ska vara en lista, t.ex. [{ sida: soder, djup: 6 }].'),
      })
      .default([]),
    /** Balconies and other parts that project above ground, drawn dashed and unlabelled. */
    balkonger: z
      .array(rectangle, { error: fieldError('balkonger ska vara en lista med rektanglar.') })
      .default([]),
    /**
     * Parking areas divided into `platser` spaces along the longer side. The first
     * `tillgangliga` spaces (from the west or north) are wider spaces for disabled persons.
     */
    parkering: z
      .array(
        z.strictObject({
          rektangel: rectangle,
          platser: z
            .number({ error: fieldError('platser ska vara ett heltal, t.ex. 9.') })
            .int({ error: fieldError('platser ska vara ett heltal.') })
            .min(1, { error: fieldError('platser ska vara minst 1.') })
            .max(60, { error: fieldError('platser får vara högst 60.') }),
          tillgangliga: z
            .number({ error: fieldError('tillgangliga ska vara ett heltal.') })
            .int({ error: fieldError('tillgangliga ska vara ett heltal.') })
            .min(0, { error: fieldError('tillgangliga får inte vara negativt.') })
            .default(0),
          namn: text.optional(),
        }),
        { error: fieldError('parkering ska vara en lista med { rektangel, platser }.') },
      )
      .default([]),
    /** Other features on the plot (terrace, septic system …), drawn thin and dashed. */
    anlaggningar: z
      .array(z.strictObject({ rektangel: rectangle, namn: text.optional() }), {
        error: fieldError('anlaggningar ska vara en lista med { rektangel, namn }.'),
      })
      .default([]),
    /** Point features with a name, e.g. a drilled well. */
    punkter: z
      .array(z.strictObject({ punkt: point, namn: text }), {
        error: fieldError('punkter ska vara en lista med { punkt, namn }.'),
      })
      .default([]),
    /** Driveway from the boundary on `sida`, `lage` metres from the western or northern corner. */
    utfart: z
      .strictObject({
        sida: side,
        lage: nonNegative,
        bredd: length,
        /** How far the driveway is drawn into the plot. */
        langd: length.default(6),
      })
      .optional(),
    /** Shoreline outside the plot, `avstand` metres beyond the boundary on `sida`. */
    strandlinje: z
      .strictObject({
        sida: side,
        avstand: nonNegative,
        namn: text.optional(),
      })
      .optional(),
    /** Shoreline protection boundary, `avstand` metres from the shoreline. */
    strandskydd: z.strictObject({ avstand: length }).optional(),
    gata: z
      .strictObject({
        sida: side,
        namn: text,
        bredd: length.default(8),
        /** Property designation of the street, e.g. Åkerslunda 1:1. */
        fastighet: text.optional(),
      })
      .optional(),
    /** Neighbours by side. On the street side the label is placed across the street. */
    grannar: z
      .strictObject({
        norr: text.optional(),
        oster: text.optional(),
        soder: text.optional(),
        vaster: text.optional(),
      })
      .default({}),
    /** Neighbouring houses, in the same coordinates (may lie outside the plot). */
    grannhus: z
      .array(rectangle, { error: fieldError('grannhus ska vara en lista med rektanglar.') })
      .default([]),
    /** Rotation of the north arrow in degrees, clockwise. 0 means north is up. */
    norr_vinkel: number('norr_vinkel ska vara ett tal i grader.').default(0),
    /** Print plot area and building areas. Off by default so the student measures. */
    visa_areor: z
      .boolean({ error: fieldError('visa_areor ska vara true eller false.') })
      .default(false),
    ritningshuvud: titleBlock,
  })
  .superRefine((p, ctx) => {
    const check = (r: Rectangle | undefined, path: (string | number)[], what: string) => {
      if (r && !inside(r, p.tomt_bredd, p.tomt_djup)) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `${what} ligger utanför tomten (0–${p.tomt_bredd} × 0–${p.tomt_djup} m).`,
        });
      }
    };
    if (!p.hus && !p.nybyggnad) {
      ctx.addIssue({
        code: 'custom',
        path: ['hus'],
        message: 'Ange hus (befintlig byggnad) eller nybyggnad (ny byggnad).',
      });
    }
    check(p.hus, ['hus'], 'Huset');
    check(p.nybyggnad, ['nybyggnad'], 'Nybyggnaden');
    p.anlaggningar.forEach((b, i) =>
      check(b.rektangel, ['anlaggningar', i, 'rektangel'], 'Anläggningen'),
    );
    if (p.utfart) {
      const u = p.utfart;
      const sideLength = u.sida === 'norr' || u.sida === 'soder' ? p.tomt_bredd : p.tomt_djup;
      if (u.lage + u.bredd > sideLength) {
        ctx.addIssue({
          code: 'custom',
          path: ['utfart', 'lage'],
          message: `Utfarten går utanför tomtgränsen (${sideLength} m).`,
        });
      }
    }
    if (p.strandskydd && !p.strandlinje) {
      ctx.addIssue({
        code: 'custom',
        path: ['strandskydd'],
        message: 'strandskydd kräver strandlinje (gränsen mäts från strandlinjen).',
      });
    }
    check(p.tillbyggnad, ['tillbyggnad'], 'Tillbyggnaden');
    check(p.komplementbyggnad, ['komplementbyggnad'], 'Komplementbyggnaden');
    p.ovriga_byggnader.forEach((b, i) =>
      check(b.rektangel, ['ovriga_byggnader', i, 'rektangel'], 'Byggnaden'),
    );
    p.avvikelse.forEach((b, i) => check(b.rektangel, ['avvikelse', i, 'rektangel'], 'Avvikelsen'));
    p.lovgivet.forEach((b, i) => check(b.rektangel, ['lovgivet', i, 'rektangel'], 'Det lovgivna'));
    p.parkering.forEach((park, i) => {
      check(park.rektangel, ['parkering', i, 'rektangel'], 'Parkeringen');
      if (park.tillgangliga > park.platser) {
        ctx.addIssue({
          code: 'custom',
          path: ['parkering', i, 'tillgangliga'],
          message: 'tillgangliga kan inte vara fler än platser.',
        });
      }
    });
    p.prickmark.forEach((zone, i) => {
      const max = zone.sida === 'norr' || zone.sida === 'soder' ? p.tomt_djup : p.tomt_bredd;
      if (zone.djup > max) {
        ctx.addIssue({
          code: 'custom',
          path: ['prickmark', i, 'djup'],
          message: `Prickmarken är djupare än tomten (${max} m).`,
        });
      }
    });
  });
export type SituationsplanParams = z.output<typeof SituationsplanSchema>;
export type SituationsplanInput = z.input<typeof SituationsplanSchema>;

// ---------------------------------------------------------------------------------------------
// Fasadritning

export const OPENING_TYPES = ['fonster', 'dorr', 'altandorr', 'port'] as const;

export const OPENING_STATUSES = ['befintlig', 'ny', 'rivs'] as const;

export const FacadeOpeningSchema = z.strictObject({
  typ: z.enum(OPENING_TYPES, {
    error: fieldError(`typ ska vara en av: ${OPENING_TYPES.join(', ')}.`),
  }),
  /**
   * For alterations: `ny` (new or changed opening, heavier line) or `rivs` (removed or filled
   * in, dashed with a cross, drawn on top). `befintlig` and no status draw the opening as usual.
   */
  status: z
    .enum(OPENING_STATUSES, {
      error: fieldError(`status ska vara en av: ${OPENING_STATUSES.join(', ')}.`),
    })
    .optional(),
  /** Distance from the left edge of the part, in metres. */
  x: nonNegative,
  bredd: length,
  /** Defaults: fönster 1.2 m, dörrar och portar 2.1 m. */
  hojd: length.optional(),
  /** Height of the lower edge above ground. Defaults: fönster 0.9 m, others 0. */
  underkant: nonNegative.optional(),
});
export type FacadeOpening = z.output<typeof FacadeOpeningSchema>;

export const FACADE_VIEWS = ['gavel', 'langsida'] as const;

/** A balcony seen in the facade: slab and railing. */
export const FacadeBalconySchema = z.strictObject({
  /** Distance from the left edge of the part, in metres. */
  x: nonNegative,
  bredd: length,
  /** Height of the balcony floor above ground. */
  underkant: nonNegative,
  /** Railing height above the balcony floor. */
  racke: length.default(1.1),
  ny: z.boolean({ error: fieldError('ny ska vara true eller false.') }).optional(),
});
export type FacadeBalcony = z.output<typeof FacadeBalconySchema>;

export const FACADE_DETAIL_TYPES = ['skylt', 'kanal'] as const;

/** Signs and ventilation ducts on a facade. */
export const FacadeDetailSchema = z.strictObject({
  typ: z.enum(FACADE_DETAIL_TYPES, {
    error: fieldError(`typ ska vara en av: ${FACADE_DETAIL_TYPES.join(', ')}.`),
  }),
  /** Distance from the left edge of the part, in metres. */
  x: nonNegative,
  bredd: length,
  underkant: nonNegative,
  hojd: length,
  /** Text on a sign, or a label next to a duct. */
  text: text.optional(),
  /** A sign of free-standing letters, without a board. */
  fristaende: z
    .boolean({ error: fieldError('fristaende ska vara true eller false.') })
    .default(false),
  ny: z.boolean({ error: fieldError('ny ska vara true eller false.') }).default(false),
});
export type FacadeDetail = z.output<typeof FacadeDetailSchema>;

export const FacadePartSchema = z
  .strictObject({
    /** Shown under the ground line, e.g. "Befintlig byggnad". */
    namn: text.optional(),
    /** Left edge along the facade, in metres. */
    x: coordinate.default(0),
    bredd: length,
    byggnadshojd: length,
    takvinkel: number('takvinkel ska vara ett tal i grader.')
      .min(0, { error: fieldError('takvinkel får inte vara negativ.') })
      .max(70, { error: fieldError('takvinkel får vara högst 70°.') }),
    /** `gavel`: the gable faces the viewer. `langsida`: the eaves face the viewer. */
    vy: z.enum(FACADE_VIEWS, {
      error: fieldError('vy ska vara gavel eller langsida.'),
    }),
    /** Building depth across the ridge. Needed for `langsida` unless `nockhojd` is given. */
    djup: length.optional(),
    nockhojd: length.optional(),
    takutsprang: nonNegative.default(0.4),
    /**
     * Flat roof (takvinkel 0) behind a parapet: the parapet's height above the roof surface.
     * The roof surface is drawn dashed below the top of the parapet (byggnadshojd).
     */
    attika: length.optional(),
    /** Part of the application (drawn with a heavier line). */
    ny: z.boolean({ error: fieldError('ny ska vara true eller false.') }).default(false),
    visa_hojder: z
      .boolean({ error: fieldError('visa_hojder ska vara true eller false.') })
      .default(true),
    oppningar: z
      .array(FacadeOpeningSchema, { error: fieldError('oppningar ska vara en lista.') })
      .default([]),
    balkonger: z
      .array(FacadeBalconySchema, { error: fieldError('balkonger ska vara en lista.') })
      .default([]),
    detaljer: z
      .array(FacadeDetailSchema, { error: fieldError('detaljer ska vara en lista.') })
      .default([]),
  })
  .superRefine((part, ctx) => {
    if (part.attika !== undefined && part.takvinkel !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['attika'],
        message: 'attika gäller bara platta tak (takvinkel 0).',
      });
    }
    if (part.attika !== undefined && part.attika >= part.byggnadshojd) {
      ctx.addIssue({
        code: 'custom',
        path: ['attika'],
        message: 'attika måste vara lägre än byggnadshojd.',
      });
    }
    part.balkonger.forEach((b, i) => {
      if (b.x + b.bredd > part.bredd + 1e-9) {
        ctx.addIssue({
          code: 'custom',
          path: ['balkonger', i, 'x'],
          message: `Balkongen slutar ${(b.x + b.bredd).toFixed(2)} m in, men delen är bara ${part.bredd} m bred.`,
        });
      }
    });
    if (part.vy === 'langsida' && part.djup === undefined && part.nockhojd === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['djup'],
        message: 'vy langsida behöver djup (eller nockhojd) för att räkna ut nockhöjden.',
      });
    }
    if (part.nockhojd !== undefined && part.nockhojd < part.byggnadshojd) {
      ctx.addIssue({
        code: 'custom',
        path: ['nockhojd'],
        message: 'nockhojd kan inte vara lägre än byggnadshojd.',
      });
    }
    part.oppningar.forEach((o, i) => {
      if (o.x + o.bredd > part.bredd + 1e-9) {
        ctx.addIssue({
          code: 'custom',
          path: ['oppningar', i, 'x'],
          message: `Öppningen slutar ${(o.x + o.bredd).toFixed(2)} m in, men delen är bara ${part.bredd} m bred.`,
        });
      }
      const top = (o.underkant ?? defaultSill(o.typ)) + (o.hojd ?? defaultOpeningHeight(o.typ));
      if (top > part.byggnadshojd + 1e-9 && part.vy === 'langsida') {
        ctx.addIssue({
          code: 'custom',
          path: ['oppningar', i, 'hojd'],
          message: `Öppningen når ${top.toFixed(2)} m, över takfoten (${part.byggnadshojd} m).`,
        });
      }
    });
  });
export type FacadePart = z.output<typeof FacadePartSchema>;

export function defaultSill(type: FacadeOpening['typ']): number {
  return type === 'fonster' ? 0.9 : 0;
}

export function defaultOpeningHeight(type: FacadeOpening['typ']): number {
  return type === 'fonster' ? 1.2 : 2.1;
}

export const FacadeSchema = z.strictObject({
  rubrik: text,
  /** Drawn in order: list the parts furthest away first. */
  delar: z
    .array(FacadePartSchema, { error: fieldError('delar ska vara en lista med byggnadsdelar.') })
    .min(1, { error: fieldError('En fasad behöver minst en del.') }),
});
export type Facade = z.output<typeof FacadeSchema>;

export const FasadritningSchema = z.strictObject({
  skala: scale(100),
  fasader: z
    .array(FacadeSchema, {
      error: fieldError('fasader ska vara en lista med en eller två fasader.'),
    })
    .min(1, { error: fieldError('Ritningen behöver minst en fasad.') })
    .max(2, { error: fieldError('En fasadritning får ha högst två fasader.') }),
  ritningshuvud: titleBlock,
});
export type FasadritningParams = z.output<typeof FasadritningSchema>;
export type FasadritningInput = z.input<typeof FasadritningSchema>;

// ---------------------------------------------------------------------------------------------
// Planritning

export const WALL_DIRECTIONS = ['horisontell', 'vertikal'] as const;

const wallOpening = {
  /** Start of the opening on the wall's northern (horisontell) or western (vertikal) face. */
  position: point,
  /** Direction of the wall. */
  vagg: z.enum(WALL_DIRECTIONS, {
    error: fieldError('vagg ska vara horisontell (öst–väst) eller vertikal (nord–syd).'),
  }),
  /** Wall thickness at the opening; defaults to the outer wall thickness. */
  tjocklek: length.optional(),
};

export const DOOR_TYPES = ['dorr', 'oppning'] as const;

export const PlanDoorSchema = z.strictObject({
  ...wallOpening,
  typ: z
    .enum(DOOR_TYPES, { error: fieldError('typ ska vara dorr eller oppning.') })
    .default('dorr'),
  bredd: length.default(0.9),
  /** Side the door leaf swings into. */
  oppnas_mot: side.optional(),
  /** Hinge at the start (west/north end) or the end of the opening. */
  gangjarn: z
    .enum(['start', 'slut'], { error: fieldError('gangjarn ska vara start eller slut.') })
    .default('start'),
});
export type PlanDoor = z.output<typeof PlanDoorSchema>;

export const PlanWindowSchema = z.strictObject({
  ...wallOpening,
  bredd: length,
});
export type PlanWindow = z.output<typeof PlanWindowSchema>;

export const PlanRoomSchema = z.strictObject({
  namn: text,
  /** Inner (net) dimensions of the room. */
  rektangel: rectangle,
  visa_area: z.boolean({ error: fieldError('visa_area ska vara true eller false.') }).default(true),
});
export type PlanRoom = z.output<typeof PlanRoomSchema>;

export const PlanBuildingSchema = z.strictObject({
  namn: text.optional(),
  /** Outer dimensions of the building body. */
  rektangel: rectangle,
  ny: z.boolean({ error: fieldError('ny ska vara true eller false.') }).default(false),
});
export type PlanBuilding = z.output<typeof PlanBuildingSchema>;

export const PlanSectionSchema = z.strictObject({
  rubrik: text.default('Sektion A-A'),
  /** Section line drawn on the plan. */
  snitt: z.strictObject({
    fran: point,
    till: point,
    /** Viewing direction. */
    sikt: side,
  }),
  bredd: length,
  byggnadshojd: length,
  takvinkel: number('takvinkel ska vara ett tal i grader.')
    .min(0, { error: fieldError('takvinkel får inte vara negativ.') })
    .max(70, { error: fieldError('takvinkel får vara högst 70°.') }),
  takutsprang: nonNegative.default(0.4),
  taktjocklek: length.default(0.4),
  golv_over_mark: nonNegative.default(0.3),
  /** Room name shown in the section. */
  rum: text.optional(),
});
export type PlanSection = z.output<typeof PlanSectionSchema>;

export const PlanritningSchema = z
  .strictObject({
    skala: scale(100),
    rubrik: text.default('Plan'),
    byggnader: z
      .array(PlanBuildingSchema, { error: fieldError('byggnader ska vara en lista.') })
      .min(1, { error: fieldError('Planritningen behöver minst en byggnad.') }),
    vaggtjocklek: length.default(0.3),
    rum: z
      .array(PlanRoomSchema, { error: fieldError('rum ska vara en lista.') })
      .min(1, { error: fieldError('Planritningen behöver minst ett rum.') }),
    dorrar: z.array(PlanDoorSchema, { error: fieldError('dorrar ska vara en lista.') }).default([]),
    fonster: z
      .array(PlanWindowSchema, { error: fieldError('fonster ska vara en lista.') })
      .default([]),
    sektion: PlanSectionSchema.optional(),
    /** Balconies outside the walls, outer dimensions. */
    balkonger: z
      .array(z.strictObject({ rektangel: rectangle, namn: text.optional() }), {
        error: fieldError('balkonger ska vara en lista med { rektangel, namn }.'),
      })
      .default([]),
    norr_vinkel: number('norr_vinkel ska vara ett tal i grader.').default(0),
    ritningshuvud: titleBlock,
  })
  .superRefine((p, ctx) => {
    p.rum.forEach((room, i) => {
      const [x, y, w, d] = room.rektangel;
      const inBuilding = p.byggnader.some(({ rektangel: [bx, by, bw, bd] }) => {
        const e = 1e-9;
        return x >= bx - e && y >= by - e && x + w <= bx + bw + e && y + d <= by + bd + e;
      });
      if (!inBuilding) {
        ctx.addIssue({
          code: 'custom',
          path: ['rum', i, 'rektangel'],
          message: `Rummet "${room.namn}" ligger inte helt inom någon byggnad.`,
        });
      }
    });
    p.dorrar.forEach((door, i) => {
      if (door.typ === 'dorr' && door.oppnas_mot === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['dorrar', i, 'oppnas_mot'],
          message: 'En dörr behöver oppnas_mot (norr, oster, soder eller vaster).',
        });
      }
      const horizontal = door.vagg === 'horisontell';
      if (door.oppnas_mot !== undefined) {
        const across =
          door.oppnas_mot === 'norr' || door.oppnas_mot === 'soder' ? horizontal : !horizontal;
        if (!across) {
          ctx.addIssue({
            code: 'custom',
            path: ['dorrar', i, 'oppnas_mot'],
            message: horizontal
              ? 'En dörr i en horisontell vägg öppnas mot norr eller soder.'
              : 'En dörr i en vertikal vägg öppnas mot oster eller vaster.',
          });
        }
      }
    });
  });
export type PlanritningParams = z.output<typeof PlanritningSchema>;
export type PlanritningInput = z.input<typeof PlanritningSchema>;

// ---------------------------------------------------------------------------------------------
// Plankarta

export const PUBLIC_USES = ['GATA', 'PARK', 'NATUR', 'TORG'] as const;

export const PUBLIC_USE_LABELS: Record<(typeof PUBLIC_USES)[number], string> = {
  GATA: 'Gata',
  PARK: 'Park',
  NATUR: 'Natur',
  TORG: 'Torg',
};

export const PlotSchema = z.strictObject({
  /** Number within the block, e.g. "7" for Björken 7. */
  beteckning: text,
  rektangel: rectangle,
  /** The property the application concerns. */
  markerad: z.boolean({ error: fieldError('markerad ska vara true eller false.') }).default(false),
});
export type Plot = z.output<typeof PlotSchema>;

export const BlockSchema = z.strictObject({
  /** Block name, e.g. BJÖRKEN. */
  namn: text,
  rektangel: rectangle,
  /** Land-use letter, e.g. B for housing. */
  anvandning: text.default('B'),
  /** Highest building height in metres. */
  byggnadshojd: length.optional(),
  /** Largest building area in percent of the property area (e₁ on the map). */
  byggnadsarea_procent: z
    .number({ error: fieldError('byggnadsarea_procent ska vara ett tal, t.ex. 20.') })
    .positive({ error: fieldError('byggnadsarea_procent ska vara större än 0.') })
    .max(100, { error: fieldError('byggnadsarea_procent får vara högst 100.') })
    .optional(),
  /** Highest number of storeys, shown as a Roman numeral (IV). */
  vaningar: z
    .number({ error: fieldError('vaningar ska vara ett heltal, t.ex. 4.') })
    .int({ error: fieldError('vaningar ska vara ett heltal.') })
    .min(1, { error: fieldError('vaningar ska vara minst 1.') })
    .max(30, { error: fieldError('vaningar får vara högst 30.') })
    .optional(),
  /** Highest ridge height in metres. */
  nockhojd: length.optional(),
  /**
   * Other property provisions with their own designation, e.g. `{ beteckning: m1, text: … }`.
   * A trailing number is drawn as an index (m₁).
   */
  bestammelser: z
    .array(z.strictObject({ beteckning: text, text }), {
      error: fieldError('bestammelser ska vara en lista med { beteckning, text }.'),
    })
    .default([]),
  /** Prickmark along each property's side, e.g. 6 m from the southern boundary. */
  prickmark: z.array(ZoneSchema, { error: fieldError('prickmark ska vara en lista.') }).default([]),
  fastigheter: z
    .array(PlotSchema, { error: fieldError('fastigheter ska vara en lista.') })
    .default([]),
});
export type Block = z.output<typeof BlockSchema>;

export const PlankartaSchema = z.strictObject({
  skala: scale(1000),
  plan: z.strictObject({
    /** e.g. Dp 1978-14. */
    beteckning: text,
    namn: text,
    laga_kraft: isoDate.optional(),
    /** Extra line, e.g. "Gäller som detaljplan". */
    anmarkning: text.optional(),
  }),
  /** Plan area `[x, y, bredd, djup]`. */
  omrade: rectangle,
  kvarter: z
    .array(BlockSchema, { error: fieldError('kvarter ska vara en lista.') })
    .min(1, { error: fieldError('Plankartan behöver minst ett kvarter.') }),
  allmanna_platser: z
    .array(
      z.strictObject({
        anvandning: z.enum(PUBLIC_USES, {
          error: fieldError(`anvandning ska vara en av: ${PUBLIC_USES.join(', ')}.`),
        }),
        namn: text.optional(),
        rektangel: rectangle,
      }),
      { error: fieldError('allmanna_platser ska vara en lista.') },
    )
    .default([]),
  norr_vinkel: number('norr_vinkel ska vara ett tal i grader.').default(0),
  ritningshuvud: titleBlock,
});
export type PlankartaParams = z.output<typeof PlankartaSchema>;
export type PlankartaInput = z.input<typeof PlankartaSchema>;

// ---------------------------------------------------------------------------------------------

/** Which document `typ` is generated by which schema. */
export const DRAWING_SCHEMAS = {
  situationsplan: SituationsplanSchema,
  fasadritning: FasadritningSchema,
  planritning: PlanritningSchema,
  plankarta: PlankartaSchema,
} as const;

export type DrawingKind = keyof typeof DRAWING_SCHEMAS;
export const DRAWING_KINDS = Object.keys(DRAWING_SCHEMAS) as DrawingKind[];

/** A validated drawing: the kind and its parsed parameters. */
export type DrawingSpec =
  | { kind: 'situationsplan'; params: SituationsplanParams }
  | { kind: 'fasadritning'; params: FasadritningParams }
  | { kind: 'planritning'; params: PlanritningParams }
  | { kind: 'plankarta'; params: PlankartaParams };
