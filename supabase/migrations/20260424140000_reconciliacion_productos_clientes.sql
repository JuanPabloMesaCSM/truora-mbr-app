-- Reconciliacion productos x cliente vs uso real en Snowflake (ultimos 90 dias)
-- Fuente: TRUORA_SCHEMA IDENTITY_PROCESSES (DI), CHECKS_CHECKS (BGC), CONVERSATIONS_STEPS (CE)
-- Threshold: >=50 eventos en 90d = producto activo, si no => NULL
-- Casos especiales resueltos con confirmacion del user (2026-04-24):
--   * Shma Capital -> BGC corregido (antes apuntaba al TCI de Global Seguros)
--   * Station24    -> DI/CE corregidos (antes CE apuntaba al TCI de Shma Capital)
--   * Avista       -> se conserva 5aurr2fg... (Avista). TCI862d52... (Avista Colombia SAS)
--                     tambien usa 15k BGC/mes pero la fila actual no lo soporta --
--                     pendiente: considerar fila separada.
--   * Didi         -> se conserva 74ibqe4p... (Didi). DiDi MX (TCI39789d...) ya tiene
--                     su propia fila 'Didi 2' que se corrige aqui.
--   * CEO / Gases del Oriente (cap. O) comparten TCIf4f6ac... -- se agrega DI a ambos
--     por decision 'mantener separado'. Alertas pueden duplicarse; consolidar mas adelante.
--
-- Clientes en integracion (TCI sin uso >=50 eventos/90d): quedan con las 3 columnas NULL
-- a proposito -- existen y consumiran pronto; se mantienen en la tabla pero fuera de
-- BotiAlertas hasta que facturen. No archivar. Lista:
--   Addi (ID 2), Assist Card, MANTECA DEV, Rappi (ID 2), Recsa, Saeplus,
--   THE DIGITAL THINKER SAS
--
-- El UPDATE se hace por `nombre` para que golpee las 3 filas duplicadas (admin access):
-- cada cliente tiene 3 filas (CSM real + amarquez + jdiaz) con mismos TCIs.

BEGIN;

-- Addi
--   DI stale, null (was TCI0f333dc93c0363e571438ac582e77956)
--   BGC add: TCI0f333dc93c0363e571438ac582e77956 (addicolombia DI=2 BGC=105172 CE=0)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCI0f333dc93c0363e571438ac582e77956'
WHERE nombre = 'Addi';

-- Addi (ID 2)
--   DI stale, null (was TCI8814ffae64e008b52f896dfa03ebbc72)
UPDATE public.clientes SET
  client_id_di = NULL
WHERE nombre = 'Addi (ID 2)';

-- Addi (ID 3)
--   BGC add: TCI4a7ce23aa8aaf3cc585afba343e17d54 (Addi - Piloto Actualización de datos 2024 DI=45176 BGC=33035 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI4a7ce23aa8aaf3cc585afba343e17d54'
WHERE nombre = 'Addi (ID 3)';

-- AeroMexico
--   BGC add: TCIe2b3b295c14fce7ef5f8c5202a819ff5 (Aeromexico DI=3982 BGC=2423 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCIe2b3b295c14fce7ef5f8c5202a819ff5'
WHERE nombre = 'AeroMexico';

-- Agricapital
--   BGC add: TCIb1afd2ba9d47d0aab336955d539a7713 (Agricapital DI=5386 BGC=4216 CE=2908)
--   CE add: TCIb1afd2ba9d47d0aab336955d539a7713 (Agricapital DI=5386 BGC=4216 CE=2908)
UPDATE public.clientes SET
  client_id_bgc = 'TCIb1afd2ba9d47d0aab336955d539a7713',
  client_id_ce = 'TCIb1afd2ba9d47d0aab336955d539a7713'
WHERE nombre = 'Agricapital';

-- ARcontrucciones
--   CE add: TCI541017e18557d45cd88d7afb5ff962bd (ARcontrucciones DI=17285 BGC=0 CE=17095)
UPDATE public.clientes SET
  client_id_ce = 'TCI541017e18557d45cd88d7afb5ff962bd'
WHERE nombre = 'ARcontrucciones';

-- Assist Card
--   DI stale, null (was TCI3b3b8ddcba17969087e3c0e5521ccdb9)
UPDATE public.clientes SET
  client_id_di = NULL
WHERE nombre = 'Assist Card';

-- Avista
--   DI stale, null (was TCI862d52cd36f52a31b0f8bbe4e8321c82)
UPDATE public.clientes SET
  client_id_di = NULL
WHERE nombre = 'Avista';

-- Ban100
--   BGC add: TCIdb1b7314c47c7d0b175640f4d1680a0c (Ban100 DI=17393 BGC=15165 CE=16361)
--   CE add: TCIdb1b7314c47c7d0b175640f4d1680a0c (Ban100 DI=17393 BGC=15165 CE=16361)
UPDATE public.clientes SET
  client_id_bgc = 'TCIdb1b7314c47c7d0b175640f4d1680a0c',
  client_id_ce = 'TCIdb1b7314c47c7d0b175640f4d1680a0c'
WHERE nombre = 'Ban100';

-- Banco W S.A.
--   BGC add: TCId5981cce1073baf2a0bc311dc90220bc (Banco W S.A. DI=6714 BGC=1975 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCId5981cce1073baf2a0bc311dc90220bc'
WHERE nombre = 'Banco W S.A.';

-- Bancolombia
--   BGC add: TCI1b30dc44374d2f5034b8c3b43510e98f (Bancolombia DI=13002 BGC=8232 CE=581)
--   CE add: TCI1b30dc44374d2f5034b8c3b43510e98f (Bancolombia DI=13002 BGC=8232 CE=581)
UPDATE public.clientes SET
  client_id_bgc = 'TCI1b30dc44374d2f5034b8c3b43510e98f',
  client_id_ce = 'TCI1b30dc44374d2f5034b8c3b43510e98f'
WHERE nombre = 'Bancolombia';

-- Cafam
--   BGC add: TCI00c7b0a3933a6ed37c66c5e92525eebe (CAJA DE COMP FAMILIAR CAFAM DI=127154 BGC=75307 CE=126864)
UPDATE public.clientes SET
  client_id_bgc = 'TCI00c7b0a3933a6ed37c66c5e92525eebe'
WHERE nombre = 'Cafam';

-- CEO
--   DI add: TCIf4f6ac4ba1ac5d9f6524b35d5cd5c5ee (promigasmercadeo DI=49419 BGC=0 CE=49036)
UPDATE public.clientes SET
  client_id_di = 'TCIf4f6ac4ba1ac5d9f6524b35d5cd5c5ee'
WHERE nombre = 'CEO';

-- Coexito
--   BGC add: TCI5f39844de0b95571dcaf069040a22834 (Coéxito DI=3052 BGC=2285 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI5f39844de0b95571dcaf069040a22834'
WHERE nombre = 'Coexito';

-- Confiamos
--   DI stale, null (was TCIdc09a6d69109eb5d3b3fe7787783c6d5)
--   BGC add: TCIdc09a6d69109eb5d3b3fe7787783c6d5 (Confiamos DI=0 BGC=9886 CE=0)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCIdc09a6d69109eb5d3b3fe7787783c6d5'
WHERE nombre = 'Confiamos';

-- Coordinadora
--   BGC add: TCI10d2b7a34ba43c4cd218527dd0276b99 (COORDINADORA MERCANTIL S A DI=4270 BGC=8766 CE=4266)
--   CE add: TCI10d2b7a34ba43c4cd218527dd0276b99 (COORDINADORA MERCANTIL S A DI=4270 BGC=8766 CE=4266)
UPDATE public.clientes SET
  client_id_bgc = 'TCI10d2b7a34ba43c4cd218527dd0276b99',
  client_id_ce = 'TCI10d2b7a34ba43c4cd218527dd0276b99'
WHERE nombre = 'Coordinadora';

-- Crediavance
--   BGC add: TCI53167124797fdd900d92059917f3c370 (CREDIAVANCE DI=6931 BGC=11932 CE=6883)
--   CE add: TCI53167124797fdd900d92059917f3c370 (CREDIAVANCE DI=6931 BGC=11932 CE=6883)
UPDATE public.clientes SET
  client_id_bgc = 'TCI53167124797fdd900d92059917f3c370',
  client_id_ce = 'TCI53167124797fdd900d92059917f3c370'
WHERE nombre = 'Crediavance';

-- Crediplus
--   BGC add: TCI1539760bcf714e6aef169034c50aea0c (Crediplus DI=14333 BGC=4729 CE=2198)
--   CE add: TCI1539760bcf714e6aef169034c50aea0c (Crediplus DI=14333 BGC=4729 CE=2198)
UPDATE public.clientes SET
  client_id_bgc = 'TCI1539760bcf714e6aef169034c50aea0c',
  client_id_ce = 'TCI1539760bcf714e6aef169034c50aea0c'
WHERE nombre = 'Crediplus';

-- Crédito Maestro
--   CE add: TCI658d1b2d797ee3b7c26fc275dca50a83 (Crédito Maestro DI=8459 BGC=10 CE=8366)
UPDATE public.clientes SET
  client_id_ce = 'TCI658d1b2d797ee3b7c26fc275dca50a83'
WHERE nombre = 'Crédito Maestro';

-- Cueros Velez
--   CE stale, null (was TCIfb5e5b5843082274ff5da4143e8e8aa0)
UPDATE public.clientes SET
  client_id_ce = NULL
WHERE nombre = 'Cueros Velez';

-- CUN
--   BGC add: TCIbfdf8d30b28cfc43358c6c64ec83dbfb (CUN DI=23042 BGC=61472 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCIbfdf8d30b28cfc43358c6c64ec83dbfb'
WHERE nombre = 'CUN';

-- Didi
--   DI stale, null (was TCI39789d3af6578a85969d3bc353bdd4c2)
UPDATE public.clientes SET
  client_id_di = NULL
WHERE nombre = 'Didi';

-- Directa24
--   DI stale, null (was TCI3a4abc41bcccb77b589608551f6437af)
--   BGC add: TCI3a4abc41bcccb77b589608551f6437af (Directa24 DI=0 BGC=459655 CE=0)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCI3a4abc41bcccb77b589608551f6437af'
WHERE nombre = 'Directa24';

-- Dislicores
--   BGC add: TCI3d2a68e13daed26582496eaf03905d7e (Dislicores DI=1139 BGC=3345 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI3d2a68e13daed26582496eaf03905d7e'
WHERE nombre = 'Dislicores';

-- Doctor Peso
--   BGC add: TCI362d10a77405c925dc783fdd62ddde4f (Doctor Peso DI=21753 BGC=13413 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI362d10a77405c925dc783fdd62ddde4f'
WHERE nombre = 'Doctor Peso';

-- Dropi
--   BGC add: TCIb4c34b2eef1694f76d217d1c912e0efc (DROPI DI=23304 BGC=20030 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCIb4c34b2eef1694f76d217d1c912e0efc'
WHERE nombre = 'Dropi';

-- Efecty
--   BGC add: TCI7270e2cbc6a3ed1e0811f30167317a54 (EFECTIVO LIMITADA DI=1183 BGC=901 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI7270e2cbc6a3ed1e0811f30167317a54'
WHERE nombre = 'Efecty';

-- EFIGAS
--   DI add: TCI61eee74c8340cec8023271047325603f (EFIGAS GAS NATURAL SA ESP DI=11845 BGC=0 CE=11678)
UPDATE public.clientes SET
  client_id_di = 'TCI61eee74c8340cec8023271047325603f'
WHERE nombre = 'EFIGAS';

-- Enlace CSC
--   BGC add: TCI6987c4e6d65a984225fb198d91aa9f5c (Enlace CSC DI=85303 BGC=72090 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI6987c4e6d65a984225fb198d91aa9f5c'
WHERE nombre = 'Enlace CSC';

-- ExcelCredit
--   DI stale, null (was TCI817e7fd18c89b0de32e88ece494338dd)
--   BGC add: TCI817e7fd18c89b0de32e88ece494338dd (KOA DI=0 BGC=20757 CE=0)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCI817e7fd18c89b0de32e88ece494338dd'
WHERE nombre = 'ExcelCredit';

-- EZ Corp
--   CE add: TCIf9395114178f272ca71ba5a4c04b373a (EZCorp DI=2310 BGC=0 CE=2309)
UPDATE public.clientes SET
  client_id_ce = 'TCIf9395114178f272ca71ba5a4c04b373a'
WHERE nombre = 'EZ Corp';

-- FINANCIERA MONTE DE PIEDAD
--   DI add: TCIe728303b71f4a4193a535c66be6956fe (FINANCIERA MONTE DE PIEDAD DI=2368 BGC=0 CE=2344)
UPDATE public.clientes SET
  client_id_di = 'TCIe728303b71f4a4193a535c66be6956fe'
WHERE nombre = 'FINANCIERA MONTE DE PIEDAD';

-- Finandina
--   CE add: TCI2e6d5145eb7817545ec896d32686bbb8 (Finandina DI=1106 BGC=0 CE=1098)
UPDATE public.clientes SET
  client_id_ce = 'TCI2e6d5145eb7817545ec896d32686bbb8'
WHERE nombre = 'Finandina';

-- Fincomercio
--   BGC add: TCIc6b86729888653131195c4f193071a2c (FINCOMERCIO DI=86320 BGC=61153 CE=64)
--   CE add: TCIc6b86729888653131195c4f193071a2c (FINCOMERCIO DI=86320 BGC=61153 CE=64)
UPDATE public.clientes SET
  client_id_bgc = 'TCIc6b86729888653131195c4f193071a2c',
  client_id_ce = 'TCIc6b86729888653131195c4f193071a2c'
WHERE nombre = 'Fincomercio';

-- Gases del Caribe
--   DI add: TCId189c152b8f6d4a388b6de5846d21805 (Gases del Caribe DI=35451 BGC=0 CE=35240)
UPDATE public.clientes SET
  client_id_di = 'TCId189c152b8f6d4a388b6de5846d21805'
WHERE nombre = 'Gases del Caribe';

-- Gases del oriente
--   BGC add: TCId66dbb6af1dad0cbd39e351b8f89333f (Gases del oriente DI=22496 BGC=18969 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCId66dbb6af1dad0cbd39e351b8f89333f'
WHERE nombre = 'Gases del oriente';

-- Gases del Oriente
--   DI add: TCIf4f6ac4ba1ac5d9f6524b35d5cd5c5ee (promigasmercadeo DI=49419 BGC=0 CE=49036)
UPDATE public.clientes SET
  client_id_di = 'TCIf4f6ac4ba1ac5d9f6524b35d5cd5c5ee'
WHERE nombre = 'Gases del Oriente';

-- Global Seguros
--   BGC add: TCI28fa158b942388fe97860402da9b9114 (sekureglobal DI=102 BGC=82 CE=102)
--   CE add: TCI28fa158b942388fe97860402da9b9114 (sekureglobal DI=102 BGC=82 CE=102)
UPDATE public.clientes SET
  client_id_bgc = 'TCI28fa158b942388fe97860402da9b9114',
  client_id_ce = 'TCI28fa158b942388fe97860402da9b9114'
WHERE nombre = 'Global Seguros';

-- Global Seguros (ID 2)
--   DI add: TCI28fa158b942388fe97860402da9b9114 (sekureglobal DI=102 BGC=82 CE=102)
--   CE add: TCI28fa158b942388fe97860402da9b9114 (sekureglobal DI=102 BGC=82 CE=102)
UPDATE public.clientes SET
  client_id_di = 'TCI28fa158b942388fe97860402da9b9114',
  client_id_ce = 'TCI28fa158b942388fe97860402da9b9114'
WHERE nombre = 'Global Seguros (ID 2)';

-- Gobierno el Salvador
--   BGC stale, null (was TCIb4a69497cd6a328e720702723c18639a)
UPDATE public.clientes SET
  client_id_bgc = NULL
WHERE nombre = 'Gobierno el Salvador';

-- HABI
--   DI stale, null (was TCI787456fdc951e5eb1a5093879fbf66b6)
UPDATE public.clientes SET
  client_id_di = NULL
WHERE nombre = 'HABI';

-- ID Finance
--   DI add: TCI04ff8764237105856df212574c49698d (CONEXRED S.A.S DI=4943 BGC=3134 CE=4929)
--   BGC add: TCI04ff8764237105856df212574c49698d (CONEXRED S.A.S DI=4943 BGC=3134 CE=4929)
UPDATE public.clientes SET
  client_id_di = 'TCI04ff8764237105856df212574c49698d',
  client_id_bgc = 'TCI04ff8764237105856df212574c49698d'
WHERE nombre = 'ID Finance';

-- Indrive
--   DI stale, null (was TCI83d4b49da224c317d08d3c71015db4f4)
UPDATE public.clientes SET
  client_id_di = NULL
WHERE nombre = 'Indrive';

-- Inmediprest
--   BGC add: TCI1692cbd49ebede50c7223ea650750dd9 (Inmediprest DI=6137 BGC=1577 CE=4082)
--   CE add: TCI1692cbd49ebede50c7223ea650750dd9 (Inmediprest DI=6137 BGC=1577 CE=4082)
UPDATE public.clientes SET
  client_id_bgc = 'TCI1692cbd49ebede50c7223ea650750dd9',
  client_id_ce = 'TCI1692cbd49ebede50c7223ea650750dd9'
WHERE nombre = 'Inmediprest';

-- JFK Cooperativa  Financiera
--   DI stale, null (was TCI7f9b37dd70b265bfc320c671d176216e)
--   BGC add: TCI7f9b37dd70b265bfc320c671d176216e (JFK Motor de decisión DI=0 BGC=230 CE=0)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCI7f9b37dd70b265bfc320c671d176216e'
WHERE nombre = 'JFK Cooperativa  Financiera';

-- JFK Cooperativa  Financiera (ID 2)
--   BGC add: TCI6e5044f36ed04fef119eb33dd67fe354 (JFK Cooperativa  Financiera DI=36434 BGC=46938 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI6e5044f36ed04fef119eb33dd67fe354'
WHERE nombre = 'JFK Cooperativa  Financiera (ID 2)';

-- Kala
--   DI stale, null (was TCI70ed43e26358e5024f90802cd8a3730d)
--   BGC add: TCI70ed43e26358e5024f90802cd8a3730d (Kala Tech DI=0 BGC=17749 CE=0)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCI70ed43e26358e5024f90802cd8a3730d'
WHERE nombre = 'Kala';

-- Littio
--   BGC add: TCI02aa3470a46fc4fc33f77247f2534a96 (SELENIO SAS DI=49828 BGC=29018 CE=2817)
--   CE add: TCI02aa3470a46fc4fc33f77247f2534a96 (SELENIO SAS DI=49828 BGC=29018 CE=2817)
UPDATE public.clientes SET
  client_id_bgc = 'TCI02aa3470a46fc4fc33f77247f2534a96',
  client_id_ce = 'TCI02aa3470a46fc4fc33f77247f2534a96'
WHERE nombre = 'Littio';

-- MANTECA DEV
--   DI stale, null (was TCI64631ffef8f6d8d037a6b730d3651cf5)
UPDATE public.clientes SET
  client_id_di = NULL
WHERE nombre = 'MANTECA DEV';

-- MATERIALES EMO S.A.S.
--   BGC add: TCI96b18fc72a85ebb565ea964cba535abd (MATERIALES EMO S.A.S. DI=86 BGC=522 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI96b18fc72a85ebb565ea964cba535abd'
WHERE nombre = 'MATERIALES EMO S.A.S.';

-- MD Finance
--   BGC add: TCIa6f01d7afe71278bc0f092fc5a9be435 (MD FINANCE PERU SAC DI=15984 BGC=20423 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCIa6f01d7afe71278bc0f092fc5a9be435'
WHERE nombre = 'MD Finance';

-- Metafinanciera
--   BGC add: TCI4524f5d971bbd3b73c543ce811507890 (METAFINANCIERA MEXICO- test DI=5197 BGC=320 CE=5138)
UPDATE public.clientes SET
  client_id_bgc = 'TCI4524f5d971bbd3b73c543ce811507890'
WHERE nombre = 'Metafinanciera';

-- MI BANCO COL
--   BGC add: TCIe521279fda8520a9696e7f3998ab64e6 (MI BANCO COL DI=6149 BGC=3073 CE=5270)
UPDATE public.clientes SET
  client_id_bgc = 'TCIe521279fda8520a9696e7f3998ab64e6'
WHERE nombre = 'MI BANCO COL';

-- MI BANCO COL (ID 2)
--   BGC add: TCI8ebe25f99d357e0587b5e90921180884 (MIBANCO- OFICINAS FISICAS DI=6709 BGC=5897 CE=56)
--   CE add: TCI8ebe25f99d357e0587b5e90921180884 (MIBANCO- OFICINAS FISICAS DI=6709 BGC=5897 CE=56)
UPDATE public.clientes SET
  client_id_bgc = 'TCI8ebe25f99d357e0587b5e90921180884',
  client_id_ce = 'TCI8ebe25f99d357e0587b5e90921180884'
WHERE nombre = 'MI BANCO COL (ID 2)';

-- Nuam
--   BGC add: TCI921b3d676f0787206169c353dccd02ca (NUAM DI=123 BGC=1556 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI921b3d676f0787206169c353dccd02ca'
WHERE nombre = 'Nuam';

-- PEXTO COLOMBIA S.A.S.
--   DI stale, null (was TCI74cf7e31da0662c51385166e50b199c8)
UPDATE public.clientes SET
  client_id_di = NULL
WHERE nombre = 'PEXTO COLOMBIA S.A.S.';

-- Powwi
--   BGC add: TCI40464c4a2ef0c8fa693b4ed7c8e407bc (Powwi - Billetera W DI=48568 BGC=23390 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI40464c4a2ef0c8fa693b4ed7c8e407bc'
WHERE nombre = 'Powwi';

-- Powwi (ID 2)
--   BGC add: TCI9c5e890a23d1a534c248dfd0022be000 (Powwi DI=29989 BGC=7646 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI9c5e890a23d1a534c248dfd0022be000'
WHERE nombre = 'Powwi (ID 2)';

-- Prestanomico
--   CE add: TCI778a84a9fc6ffa3f03575220daff76f7 (prestanomico DI=106251 BGC=0 CE=105413)
UPDATE public.clientes SET
  client_id_ce = 'TCI778a84a9fc6ffa3f03575220daff76f7'
WHERE nombre = 'Prestanomico';

-- Prestanomico (ID 2)
--   CE add: TCI0c318c020114778866eaaea009fab6a8 (Prestanómico FMDP DI=63953 BGC=0 CE=63702)
UPDATE public.clientes SET
  client_id_ce = 'TCI0c318c020114778866eaaea009fab6a8'
WHERE nombre = 'Prestanomico (ID 2)';

-- Rappi
--   DI stale, null (was TCIdd274bed338e6064e6a21799644d3a81)
--   BGC add: TCIdd274bed338e6064e6a21799644d3a81 (Rappi Aliados DI=0 BGC=1231 CE=0)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCIdd274bed338e6064e6a21799644d3a81'
WHERE nombre = 'Rappi';

-- Rappi (ID 2)
--   DI stale, null (was TCIb5c73949562fbd90ffdc9df6b46f427f)
UPDATE public.clientes SET
  client_id_di = NULL
WHERE nombre = 'Rappi (ID 2)';

-- Recsa
--   DI stale, null (was TCIcf37af93fca63c0301b1ae2797374c47)
UPDATE public.clientes SET
  client_id_di = NULL
WHERE nombre = 'Recsa';

-- RRHH Ingenia
--   DI stale, null (was TCI8e5009ec9e3854bd8384659b5351a25b)
--   BGC add: TCI8e5009ec9e3854bd8384659b5351a25b (RRHH INGENIA SOLUCIONES EN RH DI=0 BGC=13674 CE=0)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCI8e5009ec9e3854bd8384659b5351a25b'
WHERE nombre = 'RRHH Ingenia';

-- Saeplus
--   DI stale, null (was TCI2a9ebccab52848f78dc168c9a29070d9)
UPDATE public.clientes SET
  client_id_di = NULL
WHERE nombre = 'Saeplus';

-- Santander consumer
--   BGC add: TCIdc1678b9c8bc60670ddbaa5443a529b7 (Santander consumer DI=133 BGC=42107 CE=133)
--   CE add: TCIdc1678b9c8bc60670ddbaa5443a529b7 (Santander consumer DI=133 BGC=42107 CE=133)
UPDATE public.clientes SET
  client_id_bgc = 'TCIdc1678b9c8bc60670ddbaa5443a529b7',
  client_id_ce = 'TCIdc1678b9c8bc60670ddbaa5443a529b7'
WHERE nombre = 'Santander consumer';

-- Shma Capital
--   BGC unify {'TCI7eb85b57c138c8161c706fff69f1e9c6', 'TCI80450546b7259772b15d530f07c801cd'} -> TCI7eb85b57c138c8161c706fff69f1e9c6
--   CE add: TCI7eb85b57c138c8161c706fff69f1e9c6 (Shma Capital DI=10991 BGC=9920 CE=10979)
UPDATE public.clientes SET
  client_id_bgc = 'TCI7eb85b57c138c8161c706fff69f1e9c6',
  client_id_ce = 'TCI7eb85b57c138c8161c706fff69f1e9c6'
WHERE nombre = 'Shma Capital';

-- Sicrea
--   DI stale, null (was TCIefe7d18036f5a8be4016ce1df2553957)
--   BGC add: TCIefe7d18036f5a8be4016ce1df2553957 (GRUPO SICREA DI=0 BGC=1593 CE=0)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCIefe7d18036f5a8be4016ce1df2553957'
WHERE nombre = 'Sicrea';

-- Skandia
--   BGC add: TCI8e9cd5f29ee88aac60e4cc545d9ae691 (Skandia DI=26017 BGC=20715 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI8e9cd5f29ee88aac60e4cc545d9ae691'
WHERE nombre = 'Skandia';

-- Station24
--   DI add: TCI17097193bde4c5b673d1bc200dc34655 (Circulo Fitness DI=94884 BGC=0 CE=94341)
--   CE fix: TCI7eb85b57c138c8161c706fff69f1e9c6 -> TCI17097193bde4c5b673d1bc200dc34655
UPDATE public.clientes SET
  client_id_di = 'TCI17097193bde4c5b673d1bc200dc34655',
  client_id_ce = 'TCI17097193bde4c5b673d1bc200dc34655'
WHERE nombre = 'Station24';

-- Steren MX
--   CE add: TCI628e729b9d28f9eda1302c4d6b719865 (Steren Colombia DI=64 BGC=21 CE=63)
UPDATE public.clientes SET
  client_id_ce = 'TCI628e729b9d28f9eda1302c4d6b719865'
WHERE nombre = 'Steren MX';

-- Steren MX (ID 2)
--   CE add: TCI8dd8d8bad4a5239a5fd440b1eb222b2e (STEREN DI=100 BGC=29 CE=99)
UPDATE public.clientes SET
  client_id_ce = 'TCI8dd8d8bad4a5239a5fd440b1eb222b2e'
WHERE nombre = 'Steren MX (ID 2)';

-- Superlikers
--   DI add: TCIf9fcbf699d64808cb9f89d8865928604 (ID Finance DI=23061 BGC=0 CE=22893)
UPDATE public.clientes SET
  client_id_di = 'TCIf9fcbf699d64808cb9f89d8865928604'
WHERE nombre = 'Superlikers';

-- Surtigas
--   DI add: TCIfda6aa3d74356df128c9971c11910a14 (SURTIGAS S.A. E.S.P. DI=32808 BGC=0 CE=32587)
UPDATE public.clientes SET
  client_id_di = 'TCIfda6aa3d74356df128c9971c11910a14'
WHERE nombre = 'Surtigas';

-- Symplifica
--   BGC add: TCIb5677601a7287cff1bfb89563bf2fe4c (Symplifica SAS DI=1385 BGC=665 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCIb5677601a7287cff1bfb89563bf2fe4c'
WHERE nombre = 'Symplifica';

-- TELEFONICA CL
--   BGC add: TCIddb282df32a7aadb07e7dc4fa1572a05 (TELEFONICA CL DI=39080 BGC=12555 CE=39049)
UPDATE public.clientes SET
  client_id_bgc = 'TCIddb282df32a7aadb07e7dc4fa1572a05'
WHERE nombre = 'TELEFONICA CL';

-- THE DIGITAL THINKER SAS
--   DI stale, null (was TCIa85d50beba54fd81cb7170fbaecb7ad4)
--   CE stale, null (was TCIa85d50beba54fd81cb7170fbaecb7ad4)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_ce = NULL
WHERE nombre = 'THE DIGITAL THINKER SAS';

-- Trii
--   DI stale, null (was TCI300b956da8905a3d0e5ae52b08524068)
--   BGC add: TCI300b956da8905a3d0e5ae52b08524068 (Trii peru DI=1 BGC=11875 CE=1)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCI300b956da8905a3d0e5ae52b08524068'
WHERE nombre = 'Trii';

-- Trii (ID 2)
--   DI stale, null (was TCIef9da2a0de44622a8bdf9e404b14ffd2)
--   BGC add: TCIef9da2a0de44622a8bdf9e404b14ffd2 (triichile DI=0 BGC=910 CE=0)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCIef9da2a0de44622a8bdf9e404b14ffd2'
WHERE nombre = 'Trii (ID 2)';

-- Vemo
--   BGC add: TCI7af974bf32740740f87b748fbca87f00 (Vemo DI=7887 BGC=408 CE=7868)
--   CE add: TCI7af974bf32740740f87b748fbca87f00 (Vemo DI=7887 BGC=408 CE=7868)
UPDATE public.clientes SET
  client_id_bgc = 'TCI7af974bf32740740f87b748fbca87f00',
  client_id_ce = 'TCI7af974bf32740740f87b748fbca87f00'
WHERE nombre = 'Vemo';

-- Wakeup
--   BGC add: TCI9b0f026edb21b8581431f1784078c703 (WAKEUP REHABILITACIÓN DI=11982 BGC=892 CE=11919)
--   CE add: TCI9b0f026edb21b8581431f1784078c703 (WAKEUP REHABILITACIÓN DI=11982 BGC=892 CE=11919)
UPDATE public.clientes SET
  client_id_bgc = 'TCI9b0f026edb21b8581431f1784078c703',
  client_id_ce = 'TCI9b0f026edb21b8581431f1784078c703'
WHERE nombre = 'Wakeup';

-- WOMCL
--   BGC add: TCIddc781cc675f59a5ec603d6de5c49684 (WOMCL DI=99024 BGC=33875 CE=98992)
--   CE add: TCIddc781cc675f59a5ec603d6de5c49684 (WOMCL DI=99024 BGC=33875 CE=98992)
UPDATE public.clientes SET
  client_id_bgc = 'TCIddc781cc675f59a5ec603d6de5c49684',
  client_id_ce = 'TCIddc781cc675f59a5ec603d6de5c49684'
WHERE nombre = 'WOMCL';

-- Wompi
--   DI stale, null (was TCI8f85468287ae179096d030e49aa72f01)
--   BGC add: TCI8f85468287ae179096d030e49aa72f01 (Wompi Dev Test DI=10 BGC=326 CE=0)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCI8f85468287ae179096d030e49aa72f01'
WHERE nombre = 'Wompi';

-- Wompi (ID 2)
--   DI stale, null (was TCIf752d58b01813e2390639581c96ab001)
--   BGC add: TCIf752d58b01813e2390639581c96ab001 (Wompi Stag Test DI=43 BGC=565 CE=0)
UPDATE public.clientes SET
  client_id_di = NULL,
  client_id_bgc = 'TCIf752d58b01813e2390639581c96ab001'
WHERE nombre = 'Wompi (ID 2)';

-- Wompi (ID 3)
--   BGC add: TCIafff35138d703ca38d4deef61da00c1f (Wompi DI=893 BGC=63823 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCIafff35138d703ca38d4deef61da00c1f'
WHERE nombre = 'Wompi (ID 3)';

-- Xepellin
--   BGC add: TCIf430e96f0185ea8b7d80a709de70f4cf (Xepelin DI=2713 BGC=1763 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCIf430e96f0185ea8b7d80a709de70f4cf'
WHERE nombre = 'Xepellin';

-- Zippy
--   BGC add: TCI283e7e8b8dc45e32df618d514a91359b (Zippy DI=633 BGC=365 CE=0)
UPDATE public.clientes SET
  client_id_bgc = 'TCI283e7e8b8dc45e32df618d514a91359b'
WHERE nombre = 'Zippy';

-- Verificacion post-UPDATE: cuenta clientes activos con cada producto
SELECT
  COUNT(DISTINCT nombre) FILTER (WHERE client_id_di  IS NOT NULL AND client_id_di  <> '') AS clientes_con_di,
  COUNT(DISTINCT nombre) FILTER (WHERE client_id_bgc IS NOT NULL AND client_id_bgc <> '') AS clientes_con_bgc,
  COUNT(DISTINCT nombre) FILTER (WHERE client_id_ce  IS NOT NULL AND client_id_ce  <> '') AS clientes_con_ce,
  COUNT(DISTINCT nombre) AS clientes_totales
FROM public.clientes
WHERE activo = true;

-- Clientes sin NINGUN producto (posibles candidatos a archivar):
SELECT DISTINCT nombre
FROM public.clientes
WHERE activo = true
  AND (client_id_di  IS NULL OR client_id_di  = '')
  AND (client_id_bgc IS NULL OR client_id_bgc = '')
  AND (client_id_ce  IS NULL OR client_id_ce  = '')
ORDER BY nombre;

COMMIT;
