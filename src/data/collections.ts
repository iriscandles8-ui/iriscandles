export type OlfactoryNotes = {
  top: string[];
  heart: string[];
  base: string[];
};

export type ProductSize = {
  label: string;
  weightG: number;
  sku: string;
  priceCop: number | null;
};

export type Collection = {
  slug: string;
  name: string;
  aroma: string;
  tagline: string;
  description: string;
  story: string;
  family: string;
  intensity: number;
  burnHours: string;
  notes: OlfactoryNotes;
  sizes: ProductSize[];
  theme: {
    accent: string;
    soft: string;
    deep: string;
  };
  number: string;
  /** Foto principal gestionada desde el panel. Nunca es una foto de producto. */
  heroImageUrl?: string;
};

export const collections: Collection[] = [
  {
    slug: 'otono-dorado',
    name: 'Otoño Dorado',
    aroma: 'Manzana & Canela',
    tagline: 'El calor de una tarde que se alarga.',
    description:
      'Manzana horneada, canela en rama y un fondo de madera dulce. Una vela para las tardes frías, las conversaciones lentas y la luz que se vuelve dorada antes de apagarse.',
    story:
      'Nació de una sobremesa de octubre: el olor de la manzana en el horno mezclado con canela y el primer frío de la tarde. La vertimos en pequeños lotes para que el aroma no se pierda en el camino.',
    family: 'Especiado · Gourmand',
    intensity: 4,
    burnHours: '45–55 h',
    notes: {
      top: ['Manzana roja', 'Naranja'],
      heart: ['Canela', 'Clavo'],
      base: ['Madera dulce', 'Vainilla'],
    },
    sizes: [
      { label: '120 g', weightG: 120, sku: 'IRIS-OTONO-120', priceCop: null },
      { label: '240 g', weightG: 240, sku: 'IRIS-OTONO-240', priceCop: null },
    ],
    theme: { accent: '#B85E37', soft: '#F3E9D6', deep: '#8F4526' },
    number: '01',
  },
  {
    slug: 'esencia-del-valle',
    name: 'Esencia del Valle',
    aroma: 'Chontaduro & Durazno',
    tagline: 'Lo tropical y lo dulce, en equilibrio.',
    description:
      'Chontaduro del Pacífico y durazno maduro sobre una base de panela suave. Un aroma que huele a mercado, a casa de abuela y a fruta recién cortada.',
    story:
      'Quisimos llevar el Pacífico colombiano al centro de una vela. El chontaduro aporta cuerpo y el durazno lo aligera; juntos huelen a un valle que todavía no se ha ido.',
    family: 'Frutal · Tropical',
    intensity: 3,
    burnHours: '40–50 h',
    notes: {
      top: ['Durazno', 'Mandarina'],
      heart: ['Chontaduro', 'Jazmín'],
      base: ['Panela', 'Vainilla'],
    },
    sizes: [
      { label: '120 g', weightG: 120, sku: 'IRIS-VALLE-120', priceCop: null },
      { label: '240 g', weightG: 240, sku: 'IRIS-VALLE-240', priceCop: null },
    ],
    theme: { accent: '#0E6B52', soft: '#E7F1EC', deep: '#064B3B' },
    number: '02',
  },
  {
    slug: 'loto-esmeralda',
    name: 'Loto Esmeralda',
    aroma: 'Flor de Loto',
    tagline: 'Serenidad que se respira despacio.',
    description:
      'Flor de loto, hojas verdes y un soplo de aire fresco sobre almizcle limpio. Una vela para bajar el ritmo, ordenar la casa y ordenar la cabeza.',
    story:
      'La flor de loto crece en el barro y florece hacia arriba. Esa idea nos gustó para una colección que busca calma sin volverse fría: agua, verde y un fondo suave que abraza.',
    family: 'Floral · Fresco',
    intensity: 2,
    burnHours: '40–50 h',
    notes: {
      top: ['Hojas verdes', 'Bergamota'],
      heart: ['Flor de loto', 'Té verde'],
      base: ['Almizcle blanco', 'Madera clara'],
    },
    sizes: [
      { label: '120 g', weightG: 120, sku: 'IRIS-LOTO-120', priceCop: null },
      { label: '240 g', weightG: 240, sku: 'IRIS-LOTO-240', priceCop: null },
    ],
    theme: { accent: '#D9917F', soft: '#F7E4DA', deep: '#8F4526' },
    number: '03',
  },
  {
    slug: 'luz-serena',
    name: 'Luz Serena',
    aroma: 'Vainilla & Jazmín',
    tagline: 'Una luz cálida al final del día.',
    description:
      'Vainilla cremosa, jazmín blanco y un fondo de ámbar suave. Dulce sin empalagar, floral sin ser intensa: la vela de la última hora de la noche.',
    story:
      'Es la colección más cercana a una lámpara encendida: luz baja, silencio y una manta. La pensamos para acompañar la lectura, la ducha larga y el momento de apagar el teléfono.',
    family: 'Floral · Gourmand',
    intensity: 3,
    burnHours: '45–55 h',
    notes: {
      top: ['Jazmín blanco', 'Pera'],
      heart: ['Vainilla', 'Flor de azahar'],
      base: ['Ámbar', 'Sándalo'],
    },
    sizes: [
      { label: '120 g', weightG: 120, sku: 'IRIS-LUZ-120', priceCop: null },
      { label: '240 g', weightG: 240, sku: 'IRIS-LUZ-240', priceCop: null },
    ],
    theme: { accent: '#B85E37', soft: '#F3E9D6', deep: '#064B3B' },
    number: '04',
  },
];

export const getCollection = (slug: string): Collection | undefined =>
  collections.find((collection) => collection.slug === slug);
