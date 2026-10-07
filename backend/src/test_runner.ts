// Comprehensive Test Runner for Fractachain Backend
import { authenticateWithGoogle, getUserByToken, revokeSession } from './auth/google_auth';
import { authenticateWithFirebase, getFirebaseUserByToken } from './auth/firebase_auth';
import { registerKyc, getAllKycRecords, approveKyc, rejectKyc } from './admin/kyc_review';
import { processArsOnRamp, processCctpBridge } from './mocks/payment_gateway';
import { getAllCommodityPrices } from './mocks/fiat_oracle';
import { getMervalStocks } from './custody/stocks';
import { canFinalizeFromSnapshot, parseOfferingState } from './solana/lifecycle_rules';
import { settlementAction } from './market/settlement_rules';
import {
  setCustody,
  custodialSigningKey,
  upsertLogin,
  requireApprovedTrader,
  getAccount,
} from './auth/accounts';
import { isKycEnforced } from './solana/connection';

console.log('=== INICIANDO SUITE DE PRUEBAS DE FRACTACHAIN BACKEND ===');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    testsFailed++;
  }
}

// Test 1: Google Authentication
console.log('\n[1] Probando Autenticación con Google:');
const authResult = authenticateWithGoogle({
  email: 'test.producer@gmail.com',
  name: 'Juan Perez Agro',
  avatar: 'https://example.com/avatar.jpg',
});

assert(authResult.success === true, 'Google Login retorna success = true');
assert(authResult.user.email === 'test.producer@gmail.com', 'Email del usuario mapeado correctamente');
assert(authResult.user.authProvider === 'google', 'Proveedor registrado como google');
assert(Boolean(authResult.token), 'Token de sesión JWT emitido');

// Test 2: Sesión y Perfil
console.log('\n[2] Probando Consulta de Sesión con Token:');
const userSession = getUserByToken(authResult.token);
assert(userSession?.id === authResult.user.id, 'Token resuelve correctamente al usuario autenticado');
assert(userSession?.custodialWallet === '5xot9PVkPHVfvWxvXzMhQq9rY5vWn1bVfQ7kQp8mE3xJ', 'Wallet comitente de prueba asignada');

// Test 3: Logout
console.log('\n[3] Probando Cierre de Sesión (Logout):');
const revoked = revokeSession(authResult.token);
assert(revoked === true, 'Sesión revocada exitosamente');
const userAfterRevoke = getUserByToken(authResult.token);
assert(userAfterRevoke === undefined, 'Token revocado ya no devuelve usuario');

// Test 3b: Firebase Authentication
console.log('\n[3b] Probando Autenticación con Firebase Google:');
const fbAuth = authenticateWithFirebase({
  uid: 'firebase_uid_test_999',
  email: 'investor.firebase@example.com',
  displayName: 'Inversor Agropecuario Firebase',
  photoURL: 'https://example.com/fb_avatar.jpg',
  idToken: 'mock_jwt_firebase_token',
});
assert(fbAuth.success === true, 'Firebase Login retorna success = true');
assert(fbAuth.user.uid === 'firebase_uid_test_999', 'Firebase UID mapeado correctamente');
assert(fbAuth.user.authProvider === 'firebase-google', 'Proveedor registrado como firebase-google');
assert(Boolean(fbAuth.token), 'Token de sesión de Fractachain emitido desde Firebase');

const fbSession = getFirebaseUserByToken(fbAuth.token);
assert(fbSession?.uid === fbAuth.user.uid, 'Token resuelve perfil de usuario de Firebase');
assert(fbSession?.custodyMode === null, 'Cuenta Firebase arranca sin custodia hasta elegir wallet en el onboarding');

// Test 4: KYC Registration & GAFI Block
console.log('\n[4] Probando Motor KYC y Bloqueo GAFI:');
// Normal user
const kycNormal = registerKyc({
  fullName: 'Agropecuaria Las Lilas',
  documentNumber: '30-68192014-9',
  countryCode: 32,
  countryName: 'Argentina',
  address: 'Pergamino, Buenos Aires',
  investorType: 'National',
  walletAddress: '5xot9PVkPHVfvWxvXzMhQq9rY5vWn1bVfQ7kQp8mE3xJ',
  documentFrontUrl: 'https://mock.storage/dni_front.png',
  selfieUrl: 'https://mock.storage/selfie.png',
});
assert(kycNormal.success === true, 'Registro de usuario argentino admitido');

// High-Risk GAFI user (Irán = 364)
const kycGafi = registerKyc({
  fullName: 'Suspicious Entity',
  documentNumber: 'IR9999',
  countryCode: 364,
  countryName: 'Irán',
  address: 'Tehran',
  investorType: 'Foreign',
  walletAddress: '3iRANkBxj2u9ZP5wQyhVgTnM8sDcR7fL4eJ6aK1pXoNt',
  documentFrontUrl: 'https://mock.storage/passport.png',
  selfieUrl: 'https://mock.storage/selfie.png',
});
assert(kycGafi.success === false, 'Registro de país en lista negra GAFI bloqueado automáticamente');

// Test 5: KYC Approval Flow & Business Hours Lock
console.log('\n[5] Probando Aprobación Administrativa KYC y Restricción Horaria:');
import { isArgentinaBusinessHours } from './admin/kyc_review';

// Simular Miércoles 12:00 ART (Dentro de horario)
const wednesdayNoonUtc = new Date('2026-09-16T15:00:00Z'); // 15:00 UTC = 12:00 ART
assert(isArgentinaBusinessHours(wednesdayNoonUtc) === true, 'isArgentinaBusinessHours detecta Miércoles 12:00 ART como horario habilitado');

// Simular Sábado 03:00 ART (Fuera de horario)
const saturdayNightUtc = new Date('2026-09-19T06:00:00Z'); // 06:00 UTC = 03:00 ART
assert(isArgentinaBusinessHours(saturdayNightUtc) === false, 'isArgentinaBusinessHours bloquea Sábado 03:00 ART como horario no permitido');

if (kycNormal.record?.id) {
  // Aprobación con bypass/override administrativo explícito
  const approval = approveKyc(kycNormal.record.id, true);
  assert(approval.success === true, 'Aprobación de KYC exitosa con validación de seguridad');
  assert(approval.record?.status === 'APROBADO', 'Estado de KYC actualizado a APROBADO para Whitelist');
}

// Test 6: Mocks de Pagos y Oráculos
console.log('\n[6] Probando Pasarelas Mock y Oráculos:');
const arsOnramp = processArsOnRamp(145000, '5xot9PVkPHVfvWxvXzMhQq9rY5vWn1bVfQ7kQp8mE3xJ');
assert(arsOnramp.success === true && arsOnramp.usdcAmount === 100, 'On-ramp ARS a 1450 calcula exactamente $100 USDC');

const cctpBridge = processCctpBridge('arbitrum', 500, '5xot9PVkPHVfvWxvXzMhQq9rY5vWn1bVfQ7kQp8mE3xJ');
assert(cctpBridge.success === true, 'Bridge CCTP ejecutado');

const prices = getAllCommodityPrices();
assert(prices.length >= 4, 'Oráculo de granos provee cotizaciones activas (Soja, Maíz, etc.)');

const stocks = getMervalStocks();
assert(stocks.some((s) => s.tokenTicker === 'tYPF'), 'Custodia de acciones Merval incluye tYPF 1:1');

console.log('\n[7] Probando reglas de finalize (hard cap / deadline, no soft cap solo):');

assert(parseOfferingState({ tag: 'Successful' }) === 3, 'parseOfferingState lee el tag Successful del SDK');
assert(parseOfferingState(2) === 2, 'parseOfferingState acepta el entero Open');

const hard = canFinalizeFromSnapshot({ state: 2, raised: 100, hardCap: 100, deadlineMs: Date.now() + 86_400_000 });
assert(hard.canFinalize && hard.reason === 'hard_cap', 'Hard cap alcanzado habilita finalize');

const waiting = canFinalizeFromSnapshot({ state: 2, raised: 50, hardCap: 100, deadlineMs: Date.now() + 86_400_000 });
assert(!waiting.canFinalize && waiting.reason === 'waiting', 'Soft cap (50/100) NO cierra si el deadline no venció');

const late = canFinalizeFromSnapshot({
  state: 2,
  raised: 10,
  hardCap: 100,
  deadlineMs: Date.now() - 1000,
  nowMs: Date.now(),
});
assert(late.canFinalize && late.reason === 'deadline', 'Deadline vencido habilita finalize aunque falte hard cap');

const closed = canFinalizeFromSnapshot({ state: 3, raised: 100, hardCap: 100, deadlineMs: null });
assert(!closed.canFinalize && closed.reason === 'already_closed', 'Successful no se vuelve a finalizar');

console.log('\n[8] Probando el settlement automático:');

assert(
  settlementAction({ status: 'LISTED', onChain: true }) === 'check_chain',
  'Una licitación on-chain abierta consulta el contrato antes de cerrar',
);
assert(
  settlementAction({ status: 'LISTED', onChain: false }) === 'skip',
  'Una licitación sandbox abierta no la cierra el settlement automático',
);
assert(
  settlementAction({ status: 'CLOSED_SUCCESS', onChain: true }) === 'settle_holders',
  'Cerrada con éxito acredita las unidades sin que el inversor reclame',
);
assert(
  settlementAction({ status: 'CLOSED_FAILED', onChain: true }) === 'skip',
  'Cerrada fallida no acredita nada (el inversor usa refund)',
);

console.log('\n[9] Probando que ninguna respuesta filtre material secreto:');

const secAuth = upsertLogin({ email: `sec-check-${Date.now()}@example.com`, name: 'Sec Check' });
assert(secAuth.success === true, 'Cuenta de prueba de secretos creada');

let selfNoKey = false;
try {
  setCustody(secAuth.user.id, 'SELF');
} catch {
  selfNoKey = true;
}
assert(selfNoKey, 'Self-custody sin publicKey se rechaza (ya no se genera clave en el server)');

const custRes = setCustody(secAuth.user.id, 'CUSTODIAL');
const custPayload = JSON.stringify(custRes);
assert(!/secretKey|secretOnce|"secret"/i.test(custPayload), 'Respuesta de custodia no incluye secretKey/secretOnce/secret');
const internal = custodialSigningKey(secAuth.user.id);
assert(!custPayload.includes(internal), 'La secret key real no aparece serializada en la respuesta');
assert(!/secretKey|secretOnce|"secret"/i.test(JSON.stringify(secAuth.user)), 'El objeto user público no expone secretKey');

console.log('\n[10] Probando que nadie tome el email de admin ni una cuenta de Google con contraseña:');

const throws = (fn: () => unknown) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
const adminEmail = (process.env.ADMIN_EMAILS || 'erosnahuelp85@gmail.com').split(',')[0].trim();
assert(throws(() => upsertLogin({ email: adminEmail, password: 'hijack123' })), 'Email+contraseña con el email de admin se rechaza');
const googleOnly = `google-only-${Date.now()}@example.com`;
upsertLogin({ email: googleOnly, uid: `fb_${Date.now()}`, name: 'Google Only' });
assert(throws(() => upsertLogin({ email: googleOnly, password: 'hijack123' })), 'No se puede ponerle contraseña a una cuenta creada con Google');
const pwUser = `pw-${Date.now()}@example.com`;
upsertLogin({ email: pwUser, password: 'secret123' });
assert(!throws(() => upsertLogin({ email: pwUser, password: 'secret123' })), 'Login con contraseña correcta sigue funcionando');
assert(throws(() => upsertLogin({ email: pwUser, password: 'wrong123' })), 'Contraseña incorrecta se rechaza');

console.log('\n[11] Probando soft KYC en Devnet (sin bloqueo duro):');
assert(isKycEnforced() === false, 'Cluster default (devnet) no exige KYC duro');
const soft = upsertLogin({ email: `soft-kyc-${Date.now()}@example.com`, name: 'Soft Kyc' });
setCustody(soft.user.id, 'CUSTODIAL');
const softAcct = getAccount(soft.user.id)!;
softAcct.kycStatus = 'UNREGISTERED';
let softTradeOk = true;
try {
  requireApprovedTrader(softAcct);
} catch {
  softTradeOk = false;
}
assert(softTradeOk, 'Devnet permite operar con wallet y KYC UNREGISTERED');
assert(Boolean(softAcct.publicKey), 'Custodia crea publicKey Solana');

console.log(`\n=== RESUMEN: ${testsPassed} PASADOS, ${testsFailed} FALLIDOS ===\n`);
if (testsFailed > 0) {
  process.exit(1);
}
