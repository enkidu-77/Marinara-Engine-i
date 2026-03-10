; Marinara Engine — NSIS Installer Wrapper
; Compiles install.bat into a self-extracting .exe

!include "MUI2.nsh"

Name "Marinara Engine"
OutFile "Marinara-Engine-Installer-1.3.0.exe"
Unicode True
RequestExecutionLevel user
ShowInstDetails show

; ── Branding ──
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\orange-install.ico"
!define MUI_ABORTWARNING
BrandingText "Marinara Engine v1.3.0"

; ── Pages ──
!insertmacro MUI_PAGE_INSTFILES

; ── Language ──
!insertmacro MUI_LANGUAGE "English"

Section "Install"
    SetOutPath "$TEMP\marinara-installer"
    File "install.bat"

    DetailPrint "Running Marinara Engine installer..."
    DetailPrint "A command prompt window will open — follow the prompts there."
    DetailPrint ""

    ; Run the bat in a visible, interactive console
    ExecWait '"cmd.exe" /c "$TEMP\marinara-installer\install.bat"'

    ; Clean up
    RMDir /r "$TEMP\marinara-installer"
SectionEnd
