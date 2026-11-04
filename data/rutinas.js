// Rutinas de gimnasio del plan de Jon + bici/cardio. Cada ejercicio tiene un
// id estable: ese id es la clave que se usa para guardar los tildes en
// Firestore (users/{uid}/exercise/{fecha}.checked), así que si se edita el
// texto de un ejercicio acá no se pierden los tildes ya guardados — pero si
// se borra un id, los tildes viejos de ese id quedan huérfanos (no rompen
// nada, simplemente dejan de usarse).

export const RUTINAS = [
  {
    id: "rutina1",
    nombre: "Rutina 1: Pectorales y Tríceps",
    nombreCorto: "Pecho / Tríceps",
    grupos: [
      {
        nombre: "Pectorales",
        ejercicios: [
          { id: "r1-press-plano", label: "Press Plano Barra", detalle: "5 × 10" },
          { id: "r1-press-inclinado", label: "Press Inclinado Mancuernas", detalle: "4 × 10" },
          { id: "r1-apertura", label: "Apertura (Mano / Máquina)", detalle: "3 × 15" },
          { id: "r1-cruces", label: "Cruces Polea", detalle: "3 × 15" },
        ],
      },
      {
        nombre: "Tríceps",
        ejercicios: [
          { id: "r1-frances", label: "Francés Barra", detalle: "4 × 10" },
          { id: "r1-copa", label: "Copa Polea", detalle: "3 × 12" },
          { id: "r1-extension", label: "Extensión Barra", detalle: "3 × 12" },
        ],
      },
    ],
  },
  {
    id: "rutina2",
    nombre: "Rutina 2: Espalda y Bíceps",
    nombreCorto: "Espalda / Bíceps",
    grupos: [
      {
        nombre: "Espalda",
        ejercicios: [
          { id: "r2-remo-hammer", label: "Remo Hammer", detalle: "4 × 10" },
          { id: "r2-dominadas", label: "Dominadas Polea", detalle: "4 × 10" },
          { id: "r2-remo-apoyo", label: "Remo Apoyo", detalle: "3 × 15" },
          { id: "r2-remo-bajo", label: "Remo Bajo", detalle: "3 × 15" },
        ],
      },
      {
        nombre: "Bíceps",
        ejercicios: [
          { id: "r2-curl-barra", label: "Curl Barra", detalle: "4 × 10" },
          { id: "r2-curl-banco", label: "Curl Banco Inclinado", detalle: "3 × 12" },
          { id: "r2-martillo", label: "Martillo", detalle: "3 × 12" },
        ],
      },
    ],
  },
  {
    id: "rutina3",
    nombre: "Rutina 3: Piernas, Gemelos y Abdominales",
    nombreCorto: "Piernas",
    grupos: [
      {
        nombre: "Piernas",
        ejercicios: [
          { id: "r3-sillon", label: "Sillón (Cuádriceps)", detalle: "4 × 10" },
          { id: "r3-prensa45", label: "Prensa 45°", detalle: "4 × 10" },
          { id: "r3-prensa-uni", label: "Prensa Unilateral", detalle: "3 × 15" },
          { id: "r3-camilla", label: "Camilla (Isquios)", detalle: "4 × 10" },
          { id: "r3-curl-femoral", label: "Curl Femorales", detalle: "3 × 15" },
        ],
      },
      {
        nombre: "Gemelos",
        ejercicios: [
          { id: "r3-gemelos-parado", label: "Parado", detalle: "4 × 10" },
        ],
      },
      {
        nombre: "Abdominales",
        ejercicios: [
          { id: "r3-abd-cortitos", label: "Cortitos", detalle: "4 × 10" },
          { id: "r3-abd-piernas", label: "Elevación de Piernas", detalle: "3 × 15" },
          { id: "r3-abd-polea", label: "Polea", detalle: "3 × 15" },
        ],
      },
    ],
  },
  {
    id: "rutina4",
    nombre: "Rutina 4: Hombros",
    nombreCorto: "Hombros",
    grupos: [
      {
        nombre: "Hombros",
        ejercicios: [
          { id: "r4-laterales-mancuernas", label: "Laterales (Mancuernas)", detalle: "5 × 10" },
          { id: "r4-laterales-maquina", label: "Laterales (Máquina)", detalle: "3 × 15" },
          { id: "r4-press-mancuernas", label: "Press Mancuernas", detalle: "4 × 10" },
          { id: "r4-frontales", label: "Frontales", detalle: "3 × 12" },
          { id: "r4-posterior-soga", label: "Posterior Soga", detalle: "3 × 12" },
        ],
      },
    ],
  },
];

// Calentamiento aeróbico inicial — la nota del plan dice que esto aplica al
// empezar cualquier día de gimnasio (viene de la hoja de piernas), así que
// se suma como primer ítem tildable de las 4 rutinas de gimnasio.
export const CALENTAMIENTO = { id: "calentamiento-bici", label: "Aeróbico inicial: Bici", detalle: "10 min" };

// Día de bici/cardio solo, sin gimnasio.
export const BICI_ID = "bici";
export const BICI_NOMBRE = "Bici / Cardio";

// Actividades de cardio/deporte: no tienen ejercicios tildables como las
// rutinas de gimnasio, solo duración + calorías gastadas. Cada una tiene su
// propio MET aproximado (intensidad) para la estimación automática. Si en
// algún momento hay que agregar otro deporte, va una línea más acá.
export const ACTIVIDADES_CARDIO = [
  { id: "bici", nombre: "Bici / Cardio", nombreCorto: "Bici", icon: "🚲", met: 7 },
  { id: "caminata", nombre: "Caminata", nombreCorto: "Caminata", icon: "🚶", met: 3.5 },
  { id: "padel", nombre: "Pádel", nombreCorto: "Pádel", icon: "🎾", met: 6 },
  { id: "futbol5", nombre: "Fútbol 5", nombreCorto: "Fútbol 5", icon: "⚽", met: 7.5 },
  { id: "natacion", nombre: "Natación", nombreCorto: "Natación", icon: "🏊", met: 8 },
];

export function cardioPorId(id) {
  return ACTIVIDADES_CARDIO.find((a) => a.id === id) || null;
}

export function todasLasRutinas() {
  return RUTINAS;
}

export function rutinaPorId(id) {
  return RUTINAS.find((r) => r.id === id) || null;
}

// Nombre corto para mostrar en el selector y en el resumen del día.
export function nombreCortoRutina(id) {
  if (id === BICI_ID) return "🚲 Bici";
  const r = rutinaPorId(id);
  return r ? r.nombreCorto : id;
}
