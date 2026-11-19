/* ------------------------------------------------------------------
   Datos de demostración del panel.
   Se reemplazan por consultas a Supabase cuando el proyecto esté
   conectado (ver docs/admin-setup.md).
   ------------------------------------------------------------------ */

export type DemoOrderItem = {
  name: string;
  size: string;
  quantity: number;
  unitPrice: number;
};

export type DemoOrder = {
  id: string;
  number: string;
  customer: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  payment: 'pending' | 'approved' | 'declined' | 'voided' | 'error';
  total: number;
  shipping: number;
  items: DemoOrderItem[];
  createdAt: string;
  notes?: string;
  internalNotes?: string;
  tracking?: string;
  carrier?: string;
};

export const demoOrders: DemoOrder[] = [
  {
    id: 'ord-1048',
    number: 'IRIS-01048',
    customer: 'Camila Restrepo',
    email: 'camila.restrepo@gmail.com',
    phone: '+57 310 442 8890',
    city: 'Bogotá',
    address: 'Calle 70 # 5-42, apto 302 · Chapinero',
    status: 'paid',
    payment: 'approved',
    total: 228_000,
    shipping: 0,
    items: [
      { name: 'Otoño Dorado', size: '240 g', quantity: 1, unitPrice: 139_000 },
      { name: 'Loto Esmeralda', size: '120 g', quantity: 1, unitPrice: 89_000 },
    ],
    createdAt: '2026-11-11T09:24:00-05:00',
    notes: 'Empacar como regalo, incluir tarjeta.',
  },
  {
    id: 'ord-1047',
    number: 'IRIS-01047',
    customer: 'Andrés Mejía',
    email: 'andres.mejia@outlook.com',
    phone: '+57 301 887 2214',
    city: 'Medellín',
    address: 'Carrera 43A # 1-50, torre 2 · El Poblado',
    status: 'pending',
    payment: 'pending',
    total: 89_000,
    shipping: 12_000,
    items: [{ name: 'Luz Serena', size: '120 g', quantity: 1, unitPrice: 89_000 }],
    createdAt: '2026-11-11T08:05:00-05:00',
  },
  {
    id: 'ord-1046',
    number: 'IRIS-01046',
    customer: 'Valentina Gómez',
    email: 'valentina.gomez@gmail.com',
    phone: '+57 315 220 7712',
    city: 'Cali',
    address: 'Avenida 9N # 23-45 · Granada',
    status: 'processing',
    payment: 'approved',
    total: 278_000,
    shipping: 0,
    items: [{ name: 'Esencia del Valle', size: '240 g', quantity: 2, unitPrice: 139_000 }],
    createdAt: '2026-11-10T17:48:00-05:00',
    notes: 'Entregar antes del viernes.',
  },
  {
    id: 'ord-1045',
    number: 'IRIS-01045',
    customer: 'Sebastián Ortiz',
    email: 'sebastian.ortiz@hotmail.com',
    phone: '+57 320 118 9034',
    city: 'Bogotá',
    address: 'Carrera 11 # 85-32, oficina 501 · Chicó',
    status: 'shipped',
    payment: 'approved',
    total: 228_000,
    shipping: 0,
    items: [
      { name: 'Otoño Dorado', size: '240 g', quantity: 1, unitPrice: 139_000 },
      { name: 'Luz Serena', size: '120 g', quantity: 1, unitPrice: 89_000 },
    ],
    createdAt: '2026-11-09T11:12:00-05:00',
    tracking: 'ENV-88429173',
    carrier: 'Envía',
  },
  {
    id: 'ord-1044',
    number: 'IRIS-01044',
    customer: 'Laura Cárdenas',
    email: 'laura.cardenas@gmail.com',
    phone: '+57 304 552 0018',
    city: 'Barranquilla',
    address: 'Calle 82 # 46-20 · Alto Prado',
    status: 'delivered',
    payment: 'approved',
    total: 139_000,
    shipping: 12_000,
    items: [{ name: 'Loto Esmeralda', size: '240 g', quantity: 1, unitPrice: 139_000 }],
    createdAt: '2026-11-07T15:30:00-05:00',
    tracking: 'ENV-88428710',
    carrier: 'Envía',
  },
  {
    id: 'ord-1043',
    number: 'IRIS-01043',
    customer: 'Daniela Ríos',
    email: 'daniela.rios@gmail.com',
    phone: '+57 312 774 6650',
    city: 'Pereira',
    address: 'Carrera 13 # 12-08 · Álamos',
    status: 'pending',
    payment: 'pending',
    total: 178_000,
    shipping: 12_000,
    items: [
      { name: 'Luz Serena', size: '120 g', quantity: 1, unitPrice: 89_000 },
      { name: 'Otoño Dorado', size: '120 g', quantity: 1, unitPrice: 89_000 },
    ],
    createdAt: '2026-11-06T20:02:00-05:00',
  },
  {
    id: 'ord-1042',
    number: 'IRIS-01042',
    customer: 'Felipe Vargas',
    email: 'felipe.vargas@gmail.com',
    phone: '+57 318 220 4471',
    city: 'Bogotá',
    address: 'Calle 116 # 21-60, casa 4 · Usaquén',
    status: 'delivered',
    payment: 'approved',
    total: 367_000,
    shipping: 0,
    items: [
      { name: 'Otoño Dorado', size: '240 g', quantity: 2, unitPrice: 139_000 },
      { name: 'Esencia del Valle', size: '120 g', quantity: 1, unitPrice: 89_000 },
    ],
    createdAt: '2026-11-05T10:41:00-05:00',
    tracking: 'ENV-88427922',
    carrier: 'Envía',
  },
  {
    id: 'ord-1041',
    number: 'IRIS-01041',
    customer: 'Mariana López',
    email: 'mariana.lopez@gmail.com',
    phone: '+57 300 664 1180',
    city: 'Bucaramanga',
    address: 'Carrera 33 # 48-15 · Cabecera',
    status: 'cancelled',
    payment: 'declined',
    total: 89_000,
    shipping: 12_000,
    items: [{ name: 'Esencia del Valle', size: '120 g', quantity: 1, unitPrice: 89_000 }],
    createdAt: '2026-11-04T09:15:00-05:00',
    notes: 'Pago rechazado por PSE. Se contactó a la clienta.',
  },
  {
    id: 'ord-1040',
    number: 'IRIS-01040',
    customer: 'Juan Pablo Herrera',
    email: 'jp.herrera@outlook.com',
    phone: '+57 311 903 5528',
    city: 'Manizales',
    address: 'Calle 65 # 23-40 · Milán',
    status: 'delivered',
    payment: 'approved',
    total: 139_000,
    shipping: 12_000,
    items: [{ name: 'Luz Serena', size: '240 g', quantity: 1, unitPrice: 139_000 }],
    createdAt: '2026-11-02T18:27:00-05:00',
    tracking: 'ENV-88426531',
    carrier: 'Envía',
  },
  {
    id: 'ord-1039',
    number: 'IRIS-01039',
    customer: 'Sofía Ramírez',
    email: 'sofia.ramirez@gmail.com',
    phone: '+57 305 441 7782',
    city: 'Cartagena',
    address: 'Calle 8 # 2-15 · Bocagrande',
    status: 'shipped',
    payment: 'approved',
    total: 228_000,
    shipping: 12_000,
    items: [
      { name: 'Loto Esmeralda', size: '120 g', quantity: 1, unitPrice: 89_000 },
      { name: 'Luz Serena', size: '240 g', quantity: 1, unitPrice: 139_000 },
    ],
    createdAt: '2026-10-30T13:55:00-05:00',
    tracking: 'ENV-88425904',
    carrier: 'Interrapidísimo',
  },
];

/* ---------------------------- Productos ---------------------------- */

export type DemoVariant = {
  id: string;
  size: string;
  weight: number;
  sku: string;
  price: number;
  cost: number;
  stock: number;
};

export type DemoProduct = {
  id: string;
  slug: string;
  name: string;
  aroma: string;
  collection: string;
  family: string;
  intensity: number;
  status: 'active' | 'draft';
  variants: DemoVariant[];
  description: string;
};

export const demoProducts: DemoProduct[] = [
  {
    id: 'prod-otono',
    slug: 'otono-dorado',
    name: 'Otoño Dorado',
    aroma: 'Manzana & Canela',
    collection: 'Otoño Dorado',
    family: 'Especiado · Gourmand',
    intensity: 4,
    status: 'active',
    description: 'Manzana horneada, canela en rama y un fondo de madera dulce.',
    variants: [
      { id: 'var-otono-120', size: '120 g', weight: 120, sku: 'IRIS-OTONO-120', price: 89_000, cost: 34_500, stock: 24 },
      { id: 'var-otono-240', size: '240 g', weight: 240, sku: 'IRIS-OTONO-240', price: 139_000, cost: 52_800, stock: 11 },
    ],
  },
  {
    id: 'prod-valle',
    slug: 'esencia-del-valle',
    name: 'Esencia del Valle',
    aroma: 'Chontaduro & Durazno',
    collection: 'Esencia del Valle',
    family: 'Frutal · Tropical',
    intensity: 3,
    status: 'active',
    description: 'Chontaduro del Pacífico y durazno maduro sobre una base de panela suave.',
    variants: [
      { id: 'var-valle-120', size: '120 g', weight: 120, sku: 'IRIS-VALLE-120', price: 89_000, cost: 35_200, stock: 18 },
      { id: 'var-valle-240', size: '240 g', weight: 240, sku: 'IRIS-VALLE-240', price: 139_000, cost: 53_400, stock: 7 },
    ],
  },
  {
    id: 'prod-loto',
    slug: 'loto-esmeralda',
    name: 'Loto Esmeralda',
    aroma: 'Flor de Loto',
    collection: 'Loto Esmeralda',
    family: 'Floral · Fresco',
    intensity: 2,
    status: 'active',
    description: 'Flor de loto, hojas verdes y un soplo de aire fresco sobre almizcle limpio.',
    variants: [
      { id: 'var-loto-120', size: '120 g', weight: 120, sku: 'IRIS-LOTO-120', price: 89_000, cost: 34_800, stock: 4 },
      { id: 'var-loto-240', size: '240 g', weight: 240, sku: 'IRIS-LOTO-240', price: 139_000, cost: 52_600, stock: 9 },
    ],
  },
  {
    id: 'prod-luz',
    slug: 'luz-serena',
    name: 'Luz Serena',
    aroma: 'Vainilla & Jazmín',
    collection: 'Luz Serena',
    family: 'Floral · Gourmand',
    intensity: 3,
    status: 'active',
    description: 'Vainilla cremosa, jazmín blanco y un fondo de ámbar suave.',
    variants: [
      { id: 'var-luz-120', size: '120 g', weight: 120, sku: 'IRIS-LUZ-120', price: 89_000, cost: 35_000, stock: 21 },
      { id: 'var-luz-240', size: '240 g', weight: 240, sku: 'IRIS-LUZ-240', price: 139_000, cost: 53_100, stock: 3 },
    ],
  },
];

/* --------------------------- Clientes --------------------------- */

export type DemoCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  orders: number;
  spent: number;
  lastOrder: string | null;
  birthday: string;
  points: number;
  createdAt: string;
};

export const demoCustomers: DemoCustomer[] = [
  { id: 'cus-1', name: 'Camila Restrepo', email: 'camila.restrepo@gmail.com', phone: '+57 310 442 8890', city: 'Bogotá', orders: 4, spent: 623_000, lastOrder: '2026-11-11', birthday: '1992-04-18', points: 623, createdAt: '2025-11-02' },
  { id: 'cus-2', name: 'Andrés Mejía', email: 'andres.mejia@outlook.com', phone: '+57 301 887 2214', city: 'Medellín', orders: 1, spent: 89_000, lastOrder: '2026-11-11', birthday: '1988-11-24', points: 89, createdAt: '2026-11-11' },
  { id: 'cus-3', name: 'Valentina Gómez', email: 'valentina.gomez@gmail.com', phone: '+57 315 220 7712', city: 'Cali', orders: 3, spent: 496_000, lastOrder: '2026-11-10', birthday: '1995-07-03', points: 496, createdAt: '2026-02-19' },
  { id: 'cus-4', name: 'Sebastián Ortiz', email: 'sebastian.ortiz@hotmail.com', phone: '+57 320 118 9034', city: 'Bogotá', orders: 2, spent: 367_000, lastOrder: '2026-11-09', birthday: '1984-01-12', points: 367, createdAt: '2026-06-08' },
  { id: 'cus-5', name: 'Laura Cárdenas', email: 'laura.cardenas@gmail.com', phone: '+57 304 552 0018', city: 'Barranquilla', orders: 5, spent: 812_000, lastOrder: '2026-11-07', birthday: '1990-11-09', points: 812, createdAt: '2025-08-14' },
  { id: 'cus-6', name: 'Daniela Ríos', email: 'daniela.rios@gmail.com', phone: '+57 312 774 6650', city: 'Pereira', orders: 2, spent: 178_000, lastOrder: '2026-11-06', birthday: '1998-03-27', points: 178, createdAt: '2026-09-30' },
  { id: 'cus-7', name: 'Felipe Vargas', email: 'felipe.vargas@gmail.com', phone: '+57 318 220 4471', city: 'Bogotá', orders: 6, spent: 1_124_000, lastOrder: '2026-11-05', birthday: '1986-06-15', points: 1_124, createdAt: '2025-04-21' },
  { id: 'cus-8', name: 'Mariana López', email: 'mariana.lopez@gmail.com', phone: '+57 300 664 1180', city: 'Bucaramanga', orders: 1, spent: 0, lastOrder: null, birthday: '1993-11-02', points: 0, createdAt: '2026-11-04' },
  { id: 'cus-9', name: 'Juan Pablo Herrera', email: 'jp.herrera@outlook.com', phone: '+57 311 903 5528', city: 'Manizales', orders: 2, spent: 278_000, lastOrder: '2026-11-02', birthday: '1979-09-08', points: 278, createdAt: '2026-07-11' },
  { id: 'cus-10', name: 'Sofía Ramírez', email: 'sofia.ramirez@gmail.com', phone: '+57 305 441 7782', city: 'Cartagena', orders: 3, spent: 545_000, lastOrder: '2026-10-30', birthday: '1997-12-01', points: 545, createdAt: '2025-12-15' },
];

/* --------------------------- Reseñas --------------------------- */

export type DemoReview = {
  id: string;
  product: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reply?: string;
  verified: boolean;
};

export const demoReviews: DemoReview[] = [
  { id: 'rev-1', product: 'Otoño Dorado · 220 g', author: 'Camila R.', rating: 5, title: 'Huele a casa de mi abuela', body: 'La encendí un domingo en la tarde y la casa entera quedó con un aroma cálido, sin ser invasivo. La mecha se mantiene pareja y ya lleva varias horas.', status: 'pending', createdAt: '2026-11-10T18:12:00-05:00', verified: true },
  { id: 'rev-2', product: 'Loto Esmeralda · 120 g', author: 'Valentina G.', rating: 4, title: 'Muy limpia, ideal para trabajar', body: 'Me gusta que no empalaga. La uso en el escritorio mientras trabajo. Le doy cuatro porque me hubiera gustado un poco más de intensidad.', status: 'pending', createdAt: '2026-11-09T09:45:00-05:00', verified: true },
  { id: 'rev-3', product: 'Luz Serena · 220 g', author: 'Felipe V.', rating: 5, title: 'La vela de la noche', body: 'Ya es la tercera que compro. El aroma a vainilla y jazmín es exactamente lo que buscaba para leer antes de dormir. El empaque llegó impecable.', status: 'approved', createdAt: '2026-11-05T21:30:00-05:00', reply: '¡Gracias, Felipe! Nos alegra que se haya vuelto parte de tu rutina.', verified: true },
  { id: 'rev-4', product: 'Esencia del Valle · 120 g', author: 'Laura C.', rating: 5, title: 'El chontaduro se siente', body: 'No esperaba que lograran ese aroma tropical sin que fuera dulce de más. Llegó en dos días a Barranquilla y venía muy bien empacada.', status: 'approved', createdAt: '2026-11-03T14:02:00-05:00', verified: true },
  { id: 'rev-5', product: 'Otoño Dorado · 120 g', author: 'Mariana L.', rating: 2, title: 'Llegó con la caja abollada', body: 'La vela está bien, pero la caja venía golpeada y era para un regalo. Me gustaría que el empaque tuviera más protección.', status: 'pending', createdAt: '2026-11-04T10:20:00-05:00', verified: false },
  { id: 'rev-6', product: 'Luz Serena · 120 g', author: 'Sofía R.', rating: 5, title: 'Regalo perfecto', body: 'La compré para un cumpleaños y la persona quedó encantada. El tarjetón escrito a mano fue un detalle hermoso.', status: 'rejected', createdAt: '2026-10-28T16:40:00-05:00', verified: true },
];

/* -------------------------- Inventario -------------------------- */

export type DemoMaterial = {
  id: string;
  name: string;
  unit: 'g' | 'ml' | 'unidad';
  stock: number;
  minStock: number;
  cost: number;
  supplier: string;
};

export const demoMaterials: DemoMaterial[] = [
  { id: 'mat-1', name: 'Cera de soya', unit: 'g', stock: 18_400, minStock: 8_000, cost: 18, supplier: 'Ceras del Norte' },
  { id: 'mat-2', name: 'Fragancia Manzana & Canela', unit: 'ml', stock: 1_250, minStock: 500, cost: 210, supplier: 'Aromas Andinos' },
  { id: 'mat-3', name: 'Fragancia Chontaduro & Durazno', unit: 'ml', stock: 640, minStock: 500, cost: 230, supplier: 'Aromas Andinos' },
  { id: 'mat-4', name: 'Fragancia Flor de Loto', unit: 'ml', stock: 420, minStock: 500, cost: 220, supplier: 'Aromas Andinos' },
  { id: 'mat-5', name: 'Fragancia Vainilla & Jazmín', unit: 'ml', stock: 910, minStock: 500, cost: 230, supplier: 'Aromas Andinos' },
  { id: 'mat-6', name: 'Mecha de algodón', unit: 'unidad', stock: 240, minStock: 100, cost: 350, supplier: 'Insumos Bogotá' },
  { id: 'mat-7', name: 'Frasco ámbar 120 g', unit: 'unidad', stock: 38, minStock: 40, cost: 4_200, supplier: 'Vidrios Colombia' },
  { id: 'mat-8', name: 'Frasco ámbar 220 g', unit: 'unidad', stock: 52, minStock: 40, cost: 5_600, supplier: 'Vidrios Colombia' },
  { id: 'mat-9', name: 'Tapón de madera', unit: 'unidad', stock: 96, minStock: 60, cost: 1_800, supplier: 'Maderas del Sur' },
  { id: 'mat-10', name: 'Etiqueta impresa', unit: 'unidad', stock: 210, minStock: 150, cost: 400, supplier: 'Litografía La Estrella' },
  { id: 'mat-11', name: 'Caja kraft', unit: 'unidad', stock: 64, minStock: 80, cost: 1_500, supplier: 'Empaques Verdes' },
  { id: 'mat-12', name: 'Tarjeta de cuidado', unit: 'unidad', stock: 300, minStock: 100, cost: 250, supplier: 'Litografía La Estrella' },
];

export type DemoMovement = {
  id: string;
  date: string;
  type: 'in' | 'out' | 'adjustment';
  item: string;
  quantity: string;
  reason: string;
  user: string;
};

export const demoMovements: DemoMovement[] = [
  { id: 'mov-1', date: '2026-11-11T08:40:00-05:00', type: 'out', item: 'Cera de soya', quantity: '−2.400 g', reason: 'Producción lote Otoño Dorado', user: 'Iris' },
  { id: 'mov-2', date: '2026-11-10T16:15:00-05:00', type: 'out', item: 'Otoño Dorado · 220 g', quantity: '−1', reason: 'Pedido IRIS-01048', user: 'Iris' },
  { id: 'mov-3', date: '2026-11-10T11:05:00-05:00', type: 'in', item: 'Fragancia Vainilla & Jazmín', quantity: '+1.000 ml', reason: 'Compra a Aromas Andinos', user: 'María Fernanda' },
  { id: 'mov-4', date: '2026-11-09T09:30:00-05:00', type: 'adjustment', item: 'Frasco ámbar 120 g', quantity: '−3', reason: 'Unidades rotas en bodega', user: 'Iris' },
  { id: 'mov-5', date: '2026-11-08T14:22:00-05:00', type: 'in', item: 'Cera de soya', quantity: '+10.000 g', reason: 'Compra a Ceras del Norte', user: 'Iris' },
  { id: 'mov-6', date: '2026-11-07T10:10:00-05:00', type: 'out', item: 'Loto Esmeralda · 220 g', quantity: '−1', reason: 'Pedido IRIS-01044', user: 'María Fernanda' },
  { id: 'mov-7', date: '2026-11-06T17:45:00-05:00', type: 'out', item: 'Caja kraft', quantity: '−24', reason: 'Empaque de pedidos de la semana', user: 'Iris' },
];

/* -------------------------- Estadísticas -------------------------- */

export type DemoMonth = { label: string; revenue: number; orders: number };

export const demoMonths: DemoMonth[] = [
  { label: 'Ene', revenue: 1_240_000, orders: 14 },
  { label: 'Feb', revenue: 1_680_000, orders: 18 },
  { label: 'Mar', revenue: 1_420_000, orders: 16 },
  { label: 'Abr', revenue: 1_950_000, orders: 21 },
  { label: 'May', revenue: 2_180_000, orders: 23 },
  { label: 'Jun', revenue: 2_040_000, orders: 22 },
  { label: 'Jul', revenue: 2_460_000, orders: 26 },
  { label: 'Ago', revenue: 2_710_000, orders: 28 },
  { label: 'Sep', revenue: 2_380_000, orders: 25 },
  { label: 'Oct', revenue: 3_120_000, orders: 32 },
  { label: 'Nov', revenue: 1_840_000, orders: 19 },
];

export const demoTopProducts = [
  { name: 'Otoño Dorado', size: '240 g', units: 58, revenue: 8_062_000 },
  { name: 'Luz Serena', size: '240 g', units: 44, revenue: 6_116_000 },
  { name: 'Loto Esmeralda', size: '120 g', units: 39, revenue: 3_471_000 },
  { name: 'Esencia del Valle', size: '240 g', units: 31, revenue: 4_309_000 },
  { name: 'Otoño Dorado', size: '120 g', units: 27, revenue: 2_403_000 },
];

export const demoCities = [
  { name: 'Bogotá', orders: 74, share: 38 },
  { name: 'Medellín', orders: 42, share: 22 },
  { name: 'Cali', orders: 27, share: 14 },
  { name: 'Barranquilla', orders: 18, share: 9 },
  { name: 'Otras ciudades', orders: 33, share: 17 },
];

export const demoChannels = [
  { name: 'PSE', share: 46, amount: 6_450_000 },
  { name: 'Nequi', share: 28, amount: 3_920_000 },
  { name: 'Tarjeta', share: 18, amount: 2_520_000 },
  { name: 'Daviplata', share: 8, amount: 1_120_000 },
];

export const demoStatsRanges: Record<string, { revenue: number; orders: number; ticket: number; conversion: number; delta: number; series: number[] }> = {
  '7d': { revenue: 892_000, orders: 9, ticket: 99_111, conversion: 2.4, delta: 12.5, series: [89, 132, 76, 148, 96, 180, 171] },
  '30d': { revenue: 3_640_000, orders: 38, ticket: 95_789, conversion: 2.8, delta: 18.2, series: [120, 180, 145, 210, 190, 260, 230, 310, 280, 340, 305, 390] },
  '90d': { revenue: 9_980_000, orders: 102, ticket: 97_843, conversion: 2.6, delta: 9.4, series: [620, 710, 680, 840, 790, 920, 880, 1010, 960, 1120, 1080, 1260] },
  'year': { revenue: 25_020_000, orders: 264, ticket: 94_773, conversion: 2.5, delta: 24.8, series: demoMonths.map((month) => month.revenue) },
};

/* -------------------------- Promociones -------------------------- */

export type PromoUsage = {
  id: string;
  date: string;
  customer: string;
  order: string;
  discount: number;
};

export type DemoPromo = {
  id: string;
  name: string;
  code: string;
  type: 'percent' | 'fixed' | 'bundle' | 'birthday' | 'points';
  value: number;
  minTotal: number;
  startsAt: string | null;
  endsAt: string | null;
  uses: number;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  usageHistory: PromoUsage[];
  active: boolean;
};

export const demoPromos: DemoPromo[] = [
  {
    id: 'promo-1', name: 'Bienvenida', code: 'BIENVENIDA10', type: 'percent', value: 10, minTotal: 0,
    startsAt: '2026-01-01', endsAt: null, uses: 34, maxUses: null, maxUsesPerCustomer: 1, active: true,
    usageHistory: [
      { id: 'u-1', date: '2026-11-11T17:24:00', customer: 'Andrés Mejía', order: 'IRI-1042', discount: 8_900 },
      { id: 'u-2', date: '2026-11-08T11:03:00', customer: 'Mariana López', order: 'IRI-1031', discount: 12_400 },
      { id: 'u-3', date: '2026-10-29T19:45:00', customer: 'Daniela Ríos', order: 'IRI-0987', discount: 17_800 },
    ],
  },
  {
    id: 'promo-2', name: 'Especial de otoño', code: 'OTONO15', type: 'percent', value: 15, minTotal: 120_000,
    startsAt: '2026-09-01', endsAt: '2026-11-30', uses: 12, maxUses: 50, maxUsesPerCustomer: 2, active: true,
    usageHistory: [
      { id: 'u-4', date: '2026-11-10T15:12:00', customer: 'Camila Restrepo', order: 'IRI-1039', discount: 32_850 },
      { id: 'u-5', date: '2026-11-05T10:38:00', customer: 'Sebastián Ortiz', order: 'IRI-1022', discount: 18_000 },
      { id: 'u-6', date: '2026-10-21T13:56:00', customer: 'Valentina Gómez', order: 'IRI-0998', discount: 24_600 },
    ],
  },
  {
    id: 'promo-3', name: 'Envío gratis', code: 'ENVIOGRATIS', type: 'fixed', value: 12_000, minTotal: 180_000,
    startsAt: '2026-03-15', endsAt: null, uses: 27, maxUses: null, maxUsesPerCustomer: null, active: true,
    usageHistory: [
      { id: 'u-7', date: '2026-11-11T09:05:00', customer: 'Felipe Vargas', order: 'IRI-1044', discount: 12_000 },
      { id: 'u-8', date: '2026-11-02T16:20:00', customer: 'Laura Cárdenas', order: 'IRI-1018', discount: 12_000 },
    ],
  },
  {
    id: 'promo-4', name: 'Dúo de velas', code: 'DUO220', type: 'bundle', value: 20_000, minTotal: 0,
    startsAt: '2026-10-01', endsAt: '2026-12-15', uses: 8, maxUses: 30, maxUsesPerCustomer: 1, active: false,
    usageHistory: [
      { id: 'u-9', date: '2026-10-18T12:41:00', customer: 'Juan Pablo Herrera', order: 'IRI-0971', discount: 20_000 },
    ],
  },
  {
    id: 'promo-5', name: 'Cumpleaños Iris', code: 'CUMPLE15', type: 'birthday', value: 15, minTotal: 0,
    startsAt: null, endsAt: null, uses: 6, maxUses: null, maxUsesPerCustomer: 1, active: true,
    usageHistory: [
      { id: 'u-10', date: '2026-11-09T08:30:00', customer: 'Laura Cárdenas', order: 'IRI-1025', discount: 26_700 },
      { id: 'u-11', date: '2026-11-02T18:10:00', customer: 'Mariana López', order: 'IRI-1014', discount: 9_300 },
    ],
  },
];

/* --------- Descuentos especiales por temporada (sin código) --------- */

export type CampaignType = 'percent' | 'fixed';
export type CampaignApplication = 'store' | 'collection' | 'product';
export type CampaignState = 'enabled' | 'paused';

export type DemoCampaign = {
  id: string;
  name: string;
  type: CampaignType;
  value: number;
  application: CampaignApplication;
  targets: string[];
  minTotalCop: number;
  startsAt: string;
  endsAt: string;
  usageLimit: number | null;
  uses: number;
  customers: 'all' | 'selected';
  customerIds: string[];
  state: CampaignState;
  createdAt: string;
};

export const demoCampaigns: DemoCampaign[] = [
  {
    id: 'cmp-1', name: 'Navidad', type: 'percent', value: 15, application: 'store', targets: [],
    minTotalCop: 0, startsAt: '2026-12-01T00:00', endsAt: '2026-12-31T23:59',
    usageLimit: null, uses: 0, customers: 'all', customerIds: [], state: 'enabled',
    createdAt: '2026-10-20T09:00:00',
  },
  {
    id: 'cmp-2', name: 'San Valentín', type: 'percent', value: 20, application: 'collection',
    targets: ['esencia-del-valle'], minTotalCop: 120_000,
    startsAt: '2027-02-01T00:00', endsAt: '2027-02-14T23:59',
    usageLimit: 200, uses: 0, customers: 'all', customerIds: [], state: 'enabled',
    createdAt: '2026-10-22T11:30:00',
  },
  {
    id: 'cmp-3', name: 'Día de la Madre', type: 'percent', value: 15, application: 'product',
    targets: ['IRIS-LUZ-120', 'IRIS-LUZ-240'], minTotalCop: 0,
    startsAt: '2027-05-01T00:00', endsAt: '2027-05-09T23:59',
    usageLimit: 150, uses: 0, customers: 'all', customerIds: [], state: 'enabled',
    createdAt: '2026-10-25T16:15:00',
  },
  {
    id: 'cmp-4', name: 'Temporada especial de otoño', type: 'fixed', value: 12_000,
    application: 'store', targets: [], minTotalCop: 180_000,
    startsAt: '2026-09-01T00:00', endsAt: '2026-11-30T23:59',
    usageLimit: 100, uses: 64, customers: 'all', customerIds: [], state: 'enabled',
    createdAt: '2026-08-28T10:00:00',
  },
  {
    id: 'cmp-5', name: 'Preventa colección Ámbar', type: 'percent', value: 10,
    application: 'collection', targets: ['otono-dorado'], minTotalCop: 0,
    startsAt: '2026-10-01T00:00', endsAt: '2026-10-31T23:59',
    usageLimit: null, uses: 37, customers: 'selected', customerIds: ['cus-1', 'cus-3', 'cus-7'],
    state: 'paused', createdAt: '2026-09-20T14:45:00',
  },
];

/* ------------------------- Configuración ------------------------- */

export const demoAdminUsers = [
  { id: 'au-1', name: 'Iris Candles', email: 'hola@iriscandles.com', role: 'owner', active: true, lastSeen: '2026-11-11T09:10:00-05:00' },
  { id: 'au-2', name: 'María Fernanda Ruiz', email: 'maria@iriscandles.com', role: 'manager', active: true, lastSeen: '2026-11-10T18:42:00-05:00' },
  { id: 'au-3', name: 'Carlos Peña', email: 'carlos@iriscandles.com', role: 'viewer', active: false, lastSeen: '2026-10-22T11:05:00-05:00' },
];

export const demoEventRequests = [
  { id: 'evt-1', name: 'Paula Duarte', company: 'Hotel Casa Botero', type: 'Hotel', quantity: 60, date: '2026-12-05', status: 'new', createdAt: '2026-11-10T12:00:00-05:00' },
  { id: 'evt-2', name: 'Ricardo Salazar', company: 'Estudio Sur', type: 'Empresa', quantity: 120, date: '2026-12-18', status: 'contacted', createdAt: '2026-11-08T09:20:00-05:00' },
  { id: 'evt-3', name: 'Boda Gómez & Ríos', company: 'Particular', type: 'Boda', quantity: 80, date: '2027-01-24', status: 'quoted', createdAt: '2026-11-04T16:45:00-05:00' },
];

export const demoShippingZones = [
  { id: 'zone-1', name: 'Bogotá y Cundinamarca', base: 8_000, perKg: 0, eta: '1–2 días', freeFrom: 180_000 },
  { id: 'zone-2', name: 'Ciudades principales', base: 12_000, perKg: 1_500, eta: '2–3 días', freeFrom: 180_000 },
  { id: 'zone-3', name: 'Resto del país', base: 16_000, perKg: 2_000, eta: '3–5 días', freeFrom: 220_000 },
];
