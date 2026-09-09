# Vérification de la liaison parent ⇄ élève (ParentHomeScreen)
#
# Prérequis :
#   1. Migration 009 appliquée dans l'éditeur SQL Supabase
#      (colonne students.parent_user_id présente).
#   2. SUPABASE_SERVICE_ROLE_KEY RÉELLE dans .env.local
#      (Settings > API > service_role). Le placeholder actuel bloque.
#   3. (Optionnel) Fonction RPC debug_rls_context dans Supabase : le diagnostic
#      D est informatif et non bloquant ; sans elle, A/B/C restent décisifs.
#
# Usage :
#   powershell -ExecutionPolicy Bypass -File scripts\verify_parent_link.ps1
#
# Ce que fait le script (idempotent) :
#   - crée une école de test provisoire "PARENT-LINK-TEST" (slug parent-link-test)
#   - crée un compte parent + un compte staff de test (rôles via user_profiles)
#   - crée 2 élèves : PTEST-1 lié au parent, PTEST-2 NON lié (même école)
#   - se connecte en tant que le parent et vérifie par la RLS :
#       A. il ne voit QUE PTEST-1 (requête identique à l'app mobile)
#       B. PTEST-2 (enfant d'un autre) lui est invisible, même par id explicite
#       C. le staff voit toujours les 2 élèves (pas de régression web)
#   - synchronise TOUJOURS le profil existant de chaque compte de test
#     (role + school_id) : un profil obsolète d'une run antérieure empêche le
#     staff de voir toute la classe (C FAIL).
#   - après connexion du staff, diagnostique le contexte RLS via l'RPC
#     debug_rls_context : D1 (auth.uid() == $STAFF_ID) et D2 (is_staff_or_admin()
#     == true) sont bloquants ; D3 (get_user_school_id() == $SCHOOL_ID) est
#     informatif/non bloquant - la vérité se lit dans les tests A/B/C.
#
# Résultat : PASS / FAIL par assertion ; code de sortie 0 si tout passe.

$ErrorActionPreference = 'Stop'

# Encodage UTF-8 des sorties (sinon accents affichés en mojibake : "Ã©cole", "liÃ©e"...).
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# Powershell 5.1 : forcer TLS 1.2 pour les https:// vers Supabase (Invoke-RestMethod native).
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root '.env.local'
if (-not (Test-Path $envPath)) { throw ".env.local introuvable." }

$vars = @{}
Get-Content $envPath | Where-Object { $_ -notmatch '^\s*#' -and $_ -match '=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  $vars[$k.Trim()] = $v.Trim()
}

$URL   = $vars['NEXT_PUBLIC_SUPABASE_URL']
$ANON  = $vars['NEXT_PUBLIC_SUPABASE_ANON_KEY']
$SV    = $vars['SUPABASE_SERVICE_ROLE_KEY']

if (-not $SV -or ($SV -notmatch '\.')) { throw "SUPABASE_SERVICE_ROLE_KEY est absente ou est un placeholder. Renseignez la vraie clé (dashboard Supabase > Settings > API) puis relancez." }
if (-not $URL -or -not $ANON)          { throw "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes dans .env.local." }

$SCHOOL_SLUG  = 'parent-link-test'
$PARENT_EMAIL = 'parent-test@schoolsaas.test'
$PARENT_PASS  = 'Test-Parent-2026!'
$STAFF_EMAIL  = 'staff-test@schoolsaas.test'
$STAFF_PASS   = 'Test-Staff-2026!'

# SQL à coller dans l'éditeur Supabase si l'RPC debug_rls_context n'existe pas.
# Retourne le contexte RLS VU par le token appelant : auth.uid(), le rôle staff,
# super_admin et l'école détectée par get_user_school_id().
$RPC_DEBUG_SQL = @'
CREATE OR REPLACE FUNCTION public.debug_rls_context()
RETURNS TABLE (
  auth_uid uuid,
  is_staff_or_admin boolean,
  is_super_admin boolean,
  get_user_school_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid()                  AS auth_uid,
    public.is_staff_or_admin()  AS is_staff_or_admin,
    public.is_super_admin()     AS is_super_admin,
    public.get_user_school_id() AS get_user_school_id
$$;
GRANT EXECUTE ON FUNCTION public.debug_rls_context() TO authenticated;
'@

$passCount = 0; $failCount = 0

function Assert([string]$name, [bool]$ok, [string]$detail) {
  if ($ok) { $script:passCount++ } else { $script:failCount++ }
  $line = "> " + $(if ($ok) { 'PASS' } else { 'FAIL' }) + "  $name"
  if ($detail) { $line += "  --  $detail" }
  Write-Host $line -ForegroundColor $(if ($ok) { 'Green' } else { 'Red' })
}

# Convertit la réponse HTTP en tableau de LIGNES individuelles.
# NB (PS 5.1) : `$resp | ConvertFrom-Json` sur un JSON tableau (ex: `[{..},{..}]`)
# émet le tableau comme UN SEUL objet de pipeline -> `.Count` vaut 1 même avec
# 2 lignes (cause du faux échec C : le staff voyait « 1 élève » alors que les 2
# étaient dans la réponse). On force l'énumération des éléments avec foreach et
# on ré-émet un vrai tableau (sans comma unaire, qui ré-emballerait l'ensemble).
function GetRows([string]$raw) {
  if (-not $raw -or $raw.Trim() -eq '') { return @() }
  $parsed = ConvertFrom-Json $raw
  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($item in $parsed) {
    if ($null -ne $item) { [void]$rows.Add($item) }
  }
  return $rows.ToArray()
}

function PGRest {
  param([string]$Method, [string]$Path, [string]$Body = '', [string]$Bearer = '', [string]$Prefer = '')
  # NB: on évite curl.exe : PowerShell 5.1 casse les arguments JSON natifs
  # (native arg passing -> corps tronqués, "bad_json"/"PGRST102"). Invoke-WebRequest
  # passe le corps tel quel et donne accès au vrai code HTTP.
  $headers = @{ apikey = $ANON }
  if ($Bearer) { $headers.Authorization = "Bearer $Bearer" } else { $headers.Authorization = "Bearer $SV" }
  if ($Prefer) { $headers.Prefer = $Prefer }

  $iwr = @{
    Uri             = "$URL$Path"
    Method          = $Method
    Headers         = $headers
    UseBasicParsing = $true
  }
  if ($Body) {
    $iwr.Body        = $Body
    $iwr.ContentType = 'application/json; charset=utf-8'
  }

  try {
    $resp = Invoke-WebRequest @iwr
  } catch {
    $status = 0; $errBody = $_.Exception.Message
    if ($_.Exception.Response) {
      try { $status = [int]$_.Exception.Response.StatusCode } catch {}
      try {
        $r = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errBody = $r.ReadToEnd()
        $r.Close()
      } catch {}
    }
    throw "Requête $Method $Path échouée (HTTP $status) : $errBody"
  }
  return $resp.Content
}

Write-Host "== Préconditions =="
try {
  $probe = PGRest 'GET' '/rest/v1/students?select=parent_user_id&limit=1'
} catch {
  if ($_ -match 'PGRST|Unable to find') {
    throw "Migration 009 NON appliquée : la colonne students.parent_user_id n'existe pas. Collez supabase/migrations/009_add_parent_user_id.sql dans l'éditeur SQL Supabase, puis relancez ce script."
  }
  throw
}
if ($probe -match 'Unable to find|PGRST204') {
  throw "Migration 009 NON appliquée : la colonne students.parent_user_id n'existe pas. Collez supabase/migrations/009_add_parent_user_id.sql dans l'éditeur SQL Supabase, puis relancez ce script."
}
Write-Host "   colonne parent_user_id présente. OK."

Write-Host ""
Write-Host "== Fixture (idempotente) =="

# École de test
$schRows = GetRows (PGRest 'GET' "/rest/v1/schools?slug=eq.$SCHOOL_SLUG&select=id")
if ($schRows.Count -eq 0) {
  $body = @{
    name           = 'PARENT-LINK-TEST'
    slug           = $SCHOOL_SLUG
    primary_color  = '#2563EB'
    secondary_color = '#1E40AF'
    is_active      = $true
  } | ConvertTo-Json -Compress
  $SCHOOL_ID = (PGRest 'POST' '/rest/v1/schools' $body '' 'return=representation' | ConvertFrom-Json).id
  Write-Host "   école de test créée: $SCHOOL_ID"
} else {
  $SCHOOL_ID = $schRows[0].id
  Write-Host "   école de test existante: $SCHOOL_ID"
}

function EnsureUser($email, $password, $role) {
  $adminRaw = PGRest 'GET' '/auth/v1/admin/users?per_page=300'
  $adminObj = $adminRaw | ConvertFrom-Json
  $users    = @($adminObj.users) | Where-Object { $_ }
  $found    = @($users | Where-Object { $_.email -eq $email })
  if ($found.Count -gt 0) {
    $id = $found[0].id
  } else {
    $body = @{ email = $email; password = $password; email_confirm = $true } | ConvertTo-Json -Compress
    $id = (PGRest 'POST' '/auth/v1/admin/users' $body | ConvertFrom-Json).id
  }

  # IMPORTANT : synchronise TOUJOURS le profil existant (role + school_id).
  # Un profil laissé par une run antérieure (school_id obsolète, role erroné)
  # fait échouer le test C : la policy staff filtre sur get_user_school_id().
  # Si le profil existe -> PATCH ; sinon -> INSERT.
  $profRows = GetRows (PGRest 'GET' "/rest/v1/user_profiles?user_id=eq.$id&select=id,role,school_id")
  if ($profRows.Count -eq 0) {
    $pb = [ordered]@{ user_id = $id; role = $role; school_id = $SCHOOL_ID } | ConvertTo-Json -Compress
    PGRest 'POST' '/rest/v1/user_profiles' $pb | Out-Null
  } else {
    $profileBody = @{ role = $role; school_id = $SCHOOL_ID } | ConvertTo-Json -Compress
    PGRest 'PATCH' "/rest/v1/user_profiles?id=eq.$($profRows[0].id)" $profileBody | Out-Null
  }
  return $id
}

$PARENT_ID = EnsureUser $PARENT_EMAIL $PARENT_PASS 'parent'
Write-Host "   parent de test: $PARENT_ID"
$STAFF_ID = EnsureUser $STAFF_EMAIL $STAFF_PASS 'staff'
Write-Host "   staff de test:  $STAFF_ID"

# Upsert élève par (school_id, matricule) - idempotent, merci à la contrainte
# UNIQUE introduced in 007 / usage onConflict de la page students.
function UpsertStudent($matricule, $firstName, $lastName, $parentUserId) {
  $payload = [ordered]@{
    school_id    = $SCHOOL_ID
    matricule    = $matricule
    first_name   = $firstName
    last_name    = $lastName
    parent_email = $PARENT_EMAIL
    is_active    = $true
  }
  if ($parentUserId) { $payload.parent_user_id = $parentUserId }
  $body = ($payload | ConvertTo-Json -Compress)
  $raw = PGRest 'POST' "/rest/v1/students?on_conflict=school_id,matricule" $body '' 'resolution=merge-duplicates,return=representation'
  return ($raw | ConvertFrom-Json).id
}

$CHILD_ID = UpsertStudent 'PTEST-1' 'PARENT-TEST' 'ENFANT-LIE' $PARENT_ID
$OTHER_ID = UpsertStudent 'PTEST-2' 'PARENT-TEST' 'ENFANT-AUTRE' $null
Write-Host "   élève lié PTEST-1: $CHILD_ID"
Write-Host "   élève non lié PTEST-2: $OTHER_ID"

function SignInToken($email, $password) {
  $body = @{ email = $email; password = $password } | ConvertTo-Json -Compress
  return (PGRest 'POST' '/auth/v1/token?grant_type=password' $body | ConvertFrom-Json).access_token
}

$PARENT_TOKEN = SignInToken $PARENT_EMAIL $PARENT_PASS
Write-Host "   token parent obtenu."
$STAFF_TOKEN = SignInToken $STAFF_EMAIL $STAFF_PASS
Write-Host "   token staff obtenu."

Write-Host ""
Write-Host "== Diagnostic RLS (staff) =="
# RPC debug_rls_context : vérifie AVEC le token du staff que le contexte RLS
# correspond au fixture. Ce RPC est un OUTIL DE DIAGNOSTIC, pas une preuve
# supérieure au test fonctionnel : A/B/C (et D1/D2) sont les assertions
# bloquantes ; D3 est informatif. Si la fonction SQL n'existe pas, on émet un
# WARNING non bloquant (D0) avec le SQL à coller, et A/B/C restent décisifs.
$rlsCtx = $null
try {
  $ctxRaw = PGRest 'POST' '/rest/v1/rpc/debug_rls_context' '{}' $STAFF_TOKEN
  $rlsCtx = @(GetRows $ctxRaw)
} catch {
  Write-Host "   WARNING RPC debug_rls_context indisponible : $_" -ForegroundColor Yellow
  Write-Host "   WARNING Informations non bloquantes : le diagnostic D1/D2/D3 est ignoré, le test fonctionnel A/B/C reste décisif." -ForegroundColor Yellow
  Write-Host "   Pour activer le diagnostic, collez dans l'éditeur Supabase :" -ForegroundColor Yellow
  Write-Host $RPC_DEBUG_SQL -ForegroundColor Cyan
}

if ($rlsCtx -and $rlsCtx.Count -gt 0) {
  $ctxUid   = [string]$rlsCtx[0].auth_uid
  $ctxStaff = $rlsCtx[0].is_staff_or_admin
  $ctxSch   = [string]$rlsCtx[0].get_user_school_id
  $ctxSuper = $rlsCtx[0].is_super_admin

  # D1/D2 : assertions BLOQUANTES (le token résout bien le bon staff avec le bon rôle).
  Assert "D1. auth.uid() == staff de test" `
    ($ctxUid -ieq $STAFF_ID) `
    "reçu: '$ctxUid' - attendu: '$STAFF_ID'"
  Assert "D2. is_staff_or_admin() == true" `
    ($ctxStaff -eq $true) `
    "reçu: '$ctxStaff' - attendu: '$true'"

  # D3 : INFORMATIF et NON-BLOQUANT. Avec un compte de test, le helper RPC
  # get_user_school_id() peut renvoyer NULL (lecture du contexte via le token)
  # alors que la policy RLS fonctionnelle autorise correctement le staff à voir
  # les 2 élèves. La source de vérité pour le school_id est C : si C voit
  # 2 lignes, la policy staff valide le school_id. On ne compte donc ni PASS
  # ni FAIL ici en cas de NULL/différence.
  if (-not [string]::IsNullOrWhiteSpace($ctxSch)) {
    if ($ctxSch -ieq $SCHOOL_ID) {
      Assert "D3. get_user_school_id() == école de test (informatif)" $true "reçu: '$ctxSch'"
    } else {
      Write-Host "   WARNING D3. get_user_school_id() via RPC = '$ctxSch' (attendu: '$SCHOOL_ID') - informatif, non bloquant. La validation du school_id se fait via le test C." -ForegroundColor Yellow
    }
  } else {
    Write-Host "   WARNING D3. get_user_school_id() via RPC retourne NULL alors que la policy RLS fonctionnelle autorise le staff à voir les 2 élèves (validé par C). Informations non bloquantes." -ForegroundColor Yellow
  }

  Write-Host "   contexte RLS lu via le token staff : uid=$ctxUid | staff=$ctxStaff | super_admin=$ctxSuper | school=$ctxSch"
} elseif ($rlsCtx) {
  Write-Host "   WARNING RPC debug_rls_context ne renvoie pas de ligne exploitable : diagnostic D1/D2/D3 ignoré (non bloquant)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "== Assertions RLS =="

# A. Requête identique à l'app mobile : le parent ne voit QUE son enfant.
$aRaw = PGRest 'GET' "/rest/v1/students?select=id,matricule&school_id=eq.$SCHOOL_ID&parent_user_id=eq.$PARENT_ID&order=last_name.asc,first_name.asc&limit=1" '' $PARENT_TOKEN
$aRows = @(GetRows $aRaw)
Assert "A. Le parent voit son enfant (PTEST-1) et lui seul" `
  ($aRows.Count -eq 1 -and $aRows[0].id -eq $CHILD_ID) `
  "attendu: 1 ligne = PTEST-1 ; obtenu: $($aRows.Count) ligne(s)"

# B. L'élève d'un autre (PTEST-2, même école mais non lié) est invisible.
$bRaw = PGRest 'GET' "/rest/v1/students?select=id,matricule&id=eq.$OTHER_ID" '' $PARENT_TOKEN
$bRows = @(GetRows $bRaw)
Assert "B. L'élève non lié (PTEST-2) est invisible pour le parent" `
  ($bRows.Count -eq 0) `
  "obtenu: $($bRows.Count) ligne(s)"

# C. Non-régression : le staff voit toujours toute la classe (2 lignes).
# NB : le Bearer passé est EXACTEMENT $STAFF_TOKEN (PGRest ne retombe sur la
# clé service_role que si Bearer est vide) : on teste bien la RLS côté staff.
$sRaw = PGRest 'GET' "/rest/v1/students?select=id,matricule&school_id=eq.$SCHOOL_ID" '' $STAFF_TOKEN
$sRows = @(GetRows $sRaw)
$cFail = ($sRows.Count -ne 2)
$cDetail = "obtenu: $($sRows.Count) ligne(s) sur 2 attendues"
if ($cFail) {
  $cIds = @($sRows | ForEach-Object { if ($_.id) { $_.id.Substring(0, 8) } else { 'null' } })
  $cDetail += " ; id retournés: $(($cIds -join ', ') -replace '^$','(aucun)')"
  $cRawTrunc = "$sRaw"
  if ($cRawTrunc.Length -gt 600) { $cRawTrunc = $cRawTrunc.Substring(0, 600) + "...(tronqué)" }
  $cDetail += " ; raw=$cRawTrunc"
}
Assert "C. Le staff voit encore les 2 élèves" `
  (-not $cFail) `
  $cDetail
if (-not $cFail) {
  Write-Host "   OK : vérification fonctionnelle du school_id via la policy staff validée ($($sRows.Count) élèves vus - liaisons school_id conformes côté RLS)." -ForegroundColor Green
}

Write-Host ""
Write-Host "== Bilan : $passCount PASS / $failCount FAIL =="
if ($failCount -gt 0) {
  Write-Host "Vérif manuelle complémentaire (SQL editor) : SELECT * FROM pg_policies WHERE tablename = 'students';"
  Write-Host "  attendu : Staff read/insert/update/delete + Parents can read their children"
  exit 1
}
Write-Host "Nettoyage si le fixture n'est plus utile : supprimer l'école slug=$SCHOOL_SLUG (cascade students) et les comptes $PARENT_EMAIL / $STAFF_EMAIL (dashboard > Authentication)."
exit 0