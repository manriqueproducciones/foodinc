// 1. Renombrá este archivo a "firebase-config.js" (sacá el .sample).
// 2. Pegá acá las claves que te da Firebase cuando creás tu proyecto web
//    (Firebase Console → ⚙️ Configuración del proyecto → tus apps → SDK setup and configuration).
// 3. Estas claves NO son secretas: identifican tu proyecto, no dan acceso
//    a nadie por sí solas. La seguridad real la ponen las reglas de
//    Firestore (firestore.rules), que solo dejan a cada usuario leer y
//    escribir sus propios datos. Por eso este archivo SÍ se sube a GitHub.
export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU-PROYECTO.firebaseapp.com",
  projectId: "TU-PROYECTO",
  storageBucket: "TU-PROYECTO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxx",
};
