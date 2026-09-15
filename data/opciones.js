// Opciones del plan de la nutricionista (14/9/2026) + variantes agregadas.
// Se usan como autocompletado al cargar una comida y como referencia de kcal
// cuando no se analiza una foto. No es una lista cerrada: el usuario puede
// escribir cualquier otra cosa en el campo de descripción.

export const OBJETIVO_KCAL = {
  min: 1000,
  max: 1400,
};

export const OPCIONES_DESAYUNO_MERIENDA = [
  { texto: "Pan integral con mantequilla de maní y banana", kcal: 250 },
  { texto: "Granola sin azúcar, 1/2 fruta y yogur natural", kcal: 245 },
  { texto: "Panqueque de avena con banana", kcal: 195 },
  { texto: "Tostada con queso port salut y tomate", kcal: 175 },
  { texto: "Rollitos de jamón natural y queso", kcal: 240 },
  { texto: "Galletas de arroz con jamón natural y queso", kcal: 190 },
  { texto: "Galletas de arroz con queso crema, huevo y clara", kcal: 210 },
  { texto: "Huevo y claras revueltos con fruta", kcal: 180 },
  { texto: "Tostado de jamón cocido, queso y tomate", kcal: 280 },
  { texto: "Rapidita con jamón cocido, queso y tomate", kcal: 240 },
  { texto: "Fruta con yogur", kcal: 165 },
  { texto: "Galletas de arroz con queso untable y fruta fresca", kcal: 145 },
  { texto: "Tostada con palta, huevo y clara", kcal: 240 },
  { texto: "Yogur natural con frutos secos", kcal: 180 },
  { texto: "Galletas de arroz con palta y tomate", kcal: 160 },
  { texto: "Huevo duro, fruta y frutos secos", kcal: 200 },
  { texto: "Licuado de banana, leche descremada y avena", kcal: 235 },
  { texto: "Tostada integral con queso untable light y mermelada sin azúcar", kcal: 125 },
  { texto: "Rollito de jamón cocido y queso con fruta", kcal: 195 },
  { texto: "Yogur natural con granola y canela", kcal: 205 },
];

export const OPCIONES_ALMUERZO_CENA = [
  { texto: "Hamburguesas caseras de pollo con puré de boñato y ensalada", kcal: 400 },
  { texto: "Carne al horno con calabaza asada", kcal: 365 },
  { texto: "Filet de merluza al horno con ensalada", kcal: 250 },
  { texto: "Omelet de queso, jamón y tomate con ensalada", kcal: 380 },
  { texto: "Tortilla de arroz integral", kcal: 415 },
  { texto: "Churrasquito de pechuga con zapallitos revueltos", kcal: 330 },
  { texto: "Guiso de lentejas y vegetales", kcal: 290 },
  { texto: "Empanadas de vegetales con ensalada previa", kcal: 450 },
  { texto: "Ensalada con fideos de legumbres", kcal: 280 },
  { texto: "Milanesa al horno con vegetales asados", kcal: 300 },
  { texto: "Hamburguesa de legumbres con calabaza asada", kcal: 225 },
  { texto: "Tallarines integrales con vegetales salteados", kcal: 310 },
  { texto: "Tarta de vegetales sin tapa con ensalada", kcal: 330 },
  { texto: "Cabutia rellena de vegetales gratinada con queso", kcal: 235 },
  { texto: "Ensalada con arroz yamaní, lentejas o choclo", kcal: 275 },
  { texto: "Zapallitos rellenos con carne picada y vegetales", kcal: 300 },
  { texto: "Wok de verduras y semillas", kcal: 215 },
  { texto: "Wok de verduras con carne", kcal: 405 },
  { texto: "Wok de verduras con arroz yamaní", kcal: 315 },
  { texto: "Pollo al horno con batatas asadas y ensalada", kcal: 390 },
  { texto: "Revuelto de vegetales con huevo", kcal: 250 },
  { texto: "Ensalada de atún al natural con vegetales y huevo", kcal: 300 },
  { texto: "Pechuga grillada con puré de calabaza y ensalada", kcal: 335 },
  { texto: "Salteado de garbanzos con vegetales", kcal: 300 },
  { texto: "Bife de nalga a la plancha con ensalada", kcal: 320 },
  { texto: "Crema de vegetales con huevo duro y pan integral", kcal: 295 },
  { texto: "Wrap integral de pollo y vegetales", kcal: 290 },
];

export const OPCIONES_COLACION = [
  { texto: "1 fruta", kcal: 70 },
  { texto: "1 yogur descremado", kcal: 90 },
  { texto: "Rollito de jamón natural y queso", kcal: 100 },
  { texto: "10 frutos secos", kcal: 90 },
  { texto: "6 aceitunas lavadas", kcal: 40 },
  { texto: "Huevo duro o revuelto", kcal: 70 },
];

export function todasLasOpciones() {
  return [
    ...OPCIONES_DESAYUNO_MERIENDA,
    ...OPCIONES_ALMUERZO_CENA,
    ...OPCIONES_COLACION,
  ];
}
