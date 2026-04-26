-- DIAGNOSTICO 2026-04-24: Deteccion de productos reales por client_id
-- Para cada TCI en Supabase, devuelve uso en los ultimos 90 dias por producto.
-- Output: client_id | tenant_name | di_procs_90d | bgc_checks_90d | ce_events_90d + fechas ultimo uso.
-- Regla de uso: count > 0 en 90d se considera "producto activo".

WITH tci_list AS (
  SELECT COLUMN1 AS CLIENT_ID FROM VALUES
    ('5aurr2fgj3q0abioshk661qekh'),('74ibqe4p6ka7802muin8jgjnd4'),
    ('TCI00c7b0a3933a6ed37c66c5e92525eebe'),('TCI02aa3470a46fc4fc33f77247f2534a96'),
    ('TCI04ff8764237105856df212574c49698d'),('TCI05abad976e829d35d9b818b03c8b4edd'),
    ('TCI0a862e90b899b6a2c77380c64006564c'),('TCI0c318c020114778866eaaea009fab6a8'),
    ('TCI0f333dc93c0363e571438ac582e77956'),('TCI10d2b7a34ba43c4cd218527dd0276b99'),
    ('TCI1539760bcf714e6aef169034c50aea0c'),('TCI1692cbd49ebede50c7223ea650750dd9'),
    ('TCI17097193bde4c5b673d1bc200dc34655'),('TCI1b30dc44374d2f5034b8c3b43510e98f'),
    ('TCI1e6cf6d9442fe8e1ceb5180a451192d8'),('TCI223512e7ec6dc538d740e4f51806870e'),
    ('TCI283e7e8b8dc45e32df618d514a91359b'),('TCI28fa158b942388fe97860402da9b9114'),
    ('TCI2a9ebccab52848f78dc168c9a29070d9'),('TCI2e6d5145eb7817545ec896d32686bbb8'),
    ('TCI300b956da8905a3d0e5ae52b08524068'),('TCI362d10a77405c925dc783fdd62ddde4f'),
    ('TCI39789d3af6578a85969d3bc353bdd4c2'),('TCI3a4abc41bcccb77b589608551f6437af'),
    ('TCI3b3b8ddcba17969087e3c0e5521ccdb9'),('TCI3d2a68e13daed26582496eaf03905d7e'),
    ('TCI40464c4a2ef0c8fa693b4ed7c8e407bc'),('TCI4524f5d971bbd3b73c543ce811507890'),
    ('TCI4a7ce23aa8aaf3cc585afba343e17d54'),('TCI53167124797fdd900d92059917f3c370'),
    ('TCI541017e18557d45cd88d7afb5ff962bd'),('TCI5f39844de0b95571dcaf069040a22834'),
    ('TCI61eee74c8340cec8023271047325603f'),('TCI628e729b9d28f9eda1302c4d6b719865'),
    ('TCI64631ffef8f6d8d037a6b730d3651cf5'),('TCI658d1b2d797ee3b7c26fc275dca50a83'),
    ('TCI6987c4e6d65a984225fb198d91aa9f5c'),('TCI6e5044f36ed04fef119eb33dd67fe354'),
    ('TCI70ed43e26358e5024f90802cd8a3730d'),('TCI7270e2cbc6a3ed1e0811f30167317a54'),
    ('TCI727fd2d9d603ab0f27a66a4b74c9cd7d'),('TCI74cf7e31da0662c51385166e50b199c8'),
    ('TCI778a84a9fc6ffa3f03575220daff76f7'),('TCI787456fdc951e5eb1a5093879fbf66b6'),
    ('TCI7af974bf32740740f87b748fbca87f00'),('TCI7eb85b57c138c8161c706fff69f1e9c6'),
    ('TCI7f9b37dd70b265bfc320c671d176216e'),('TCI80450546b7259772b15d530f07c801cd'),
    ('TCI817e7fd18c89b0de32e88ece494338dd'),('TCI83d4b49da224c317d08d3c71015db4f4'),
    ('TCI862d52cd36f52a31b0f8bbe4e8321c82'),('TCI8814ffae64e008b52f896dfa03ebbc72'),
    ('TCI8dd8d8bad4a5239a5fd440b1eb222b2e'),('TCI8e5009ec9e3854bd8384659b5351a25b'),
    ('TCI8e9cd5f29ee88aac60e4cc545d9ae691'),('TCI8ebe25f99d357e0587b5e90921180884'),
    ('TCI8f85468287ae179096d030e49aa72f01'),('TCI921b3d676f0787206169c353dccd02ca'),
    ('TCI96b18fc72a85ebb565ea964cba535abd'),('TCI9b0f026edb21b8581431f1784078c703'),
    ('TCI9c5e890a23d1a534c248dfd0022be000'),('TCIa6f01d7afe71278bc0f092fc5a9be435'),
    ('TCIa72a284a9cb2afa26118d092ead4d993'),('TCIa85d50beba54fd81cb7170fbaecb7ad4'),
    ('TCIafff35138d703ca38d4deef61da00c1f'),('TCIb1afd2ba9d47d0aab336955d539a7713'),
    ('TCIb4a69497cd6a328e720702723c18639a'),('TCIb4c34b2eef1694f76d217d1c912e0efc'),
    ('TCIb5677601a7287cff1bfb89563bf2fe4c'),('TCIb5c73949562fbd90ffdc9df6b46f427f'),
    ('TCIbfdf8d30b28cfc43358c6c64ec83dbfb'),('TCIc6b86729888653131195c4f193071a2c'),
    ('TCIcf37af93fca63c0301b1ae2797374c47'),('TCId189c152b8f6d4a388b6de5846d21805'),
    ('TCId5981cce1073baf2a0bc311dc90220bc'),('TCId66dbb6af1dad0cbd39e351b8f89333f'),
    ('TCId702145a43fd40652c5d0fbe6ef0f884'),('TCIdb1b7314c47c7d0b175640f4d1680a0c'),
    ('TCIdc09a6d69109eb5d3b3fe7787783c6d5'),('TCIdc1678b9c8bc60670ddbaa5443a529b7'),
    ('TCIdd274bed338e6064e6a21799644d3a81'),('TCIddb282df32a7aadb07e7dc4fa1572a05'),
    ('TCIddc781cc675f59a5ec603d6de5c49684'),('TCIe2b3b295c14fce7ef5f8c5202a819ff5'),
    ('TCIe521279fda8520a9696e7f3998ab64e6'),('TCIe728303b71f4a4193a535c66be6956fe'),
    ('TCIef9da2a0de44622a8bdf9e404b14ffd2'),('TCIefe7d18036f5a8be4016ce1df2553957'),
    ('TCIf430e96f0185ea8b7d80a709de70f4cf'),('TCIf4f6ac4ba1ac5d9f6524b35d5cd5c5ee'),
    ('TCIf752d58b01813e2390639581c96ab001'),('TCIf9395114178f272ca71ba5a4c04b373a'),
    ('TCIf9fcbf699d64808cb9f89d8865928604'),('TCIfb5e5b5843082274ff5da4143e8e8aa0'),
    ('TCIfda6aa3d74356df128c9971c11910a14')
),

cutoff AS (SELECT DATEADD('day', -90, CURRENT_TIMESTAMP()) AS since_ts),

di AS (
  SELECT
    p.client_id,
    COUNT(DISTINCT p.process_id) AS di_procs_90d,
    MAX(CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date))::DATE AS di_last_use
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p, cutoff
  WHERE p.client_id IN (SELECT client_id FROM tci_list)
    AND p.creation_date >= cutoff.since_ts
  GROUP BY p.client_id
),

bgc AS (
  SELECT
    c.client_id,
    COUNT(c.check_id) AS bgc_checks_90d,
    MAX(CONVERT_TIMEZONE('UTC','America/Bogota', c.creation_date))::DATE AS bgc_last_use
  FROM TRUORA.TRUORA_SCHEMA.CHECKS_CHECKS c, cutoff
  WHERE c.client_id IN (SELECT client_id FROM tci_list)
    AND c.creation_date >= cutoff.since_ts
  GROUP BY c.client_id
),

ce AS (
  SELECT
    cs.client_id,
    COUNT(DISTINCT cs.process_id) AS ce_events_90d,
    MAX(CONVERT_TIMEZONE('UTC','America/Bogota', cs.creation_date))::DATE AS ce_last_use
  FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS cs, cutoff
  WHERE cs.client_id IN (SELECT client_id FROM tci_list)
    AND cs.trigger_channel_type IN ('inbound','outbound','notification')
    AND cs.creation_date >= cutoff.since_ts
  GROUP BY cs.client_id
)

SELECT
  t.client_id AS CLIENT_ID,
  tn.company_name AS TENANT_NAME,
  COALESCE(di.di_procs_90d, 0) AS DI_PROCS_90D,
  COALESCE(bgc.bgc_checks_90d, 0) AS BGC_CHECKS_90D,
  COALESCE(ce.ce_events_90d, 0) AS CE_EVENTS_90D,
  di.di_last_use AS DI_LAST_USE,
  bgc.bgc_last_use AS BGC_LAST_USE,
  ce.ce_last_use AS CE_LAST_USE
FROM tci_list t
LEFT JOIN TRUORA.TRUORA_SCHEMA.TENANT tn ON tn.truora_client_id = t.client_id
LEFT JOIN di ON di.client_id = t.client_id
LEFT JOIN bgc ON bgc.client_id = t.client_id
LEFT JOIN ce ON ce.client_id = t.client_id
ORDER BY
  (COALESCE(di.di_procs_90d,0) + COALESCE(bgc.bgc_checks_90d,0) + COALESCE(ce.ce_events_90d,0)) DESC;
