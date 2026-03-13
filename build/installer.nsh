; ============================================================
; SIMANTU - Custom NSIS Installer Script
; Modern wizard with UGM branding
; ============================================================

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"

; ============================================================
; Modern UI Configuration
; ============================================================

; UI Settings
!define MUI_ABORTWARNING
!define MUI_UNABORTWARNING

; Colors & Branding
!define MUI_BGCOLOR "004175"
!define MUI_TEXTCOLOR "FFFFFF"

; Icon
!define MUI_ICON "${BUILD_RESOURCES_DIR}\logo_aplikasi.ico"
!define MUI_UNICON "${BUILD_RESOURCES_DIR}\logo_aplikasi.ico"

; Header image (150x57 banner at top of pages)
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "installerHeader.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "uninstallerHeader.bmp"

; Welcome/Finish page sidebar image (164x314)
!define MUI_WELCOMEFINISHPAGE_BITMAP "installerSidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "uninstallerSidebarBMP.bmp"

; ============================================================
; Welcome Page
; ============================================================
!define MUI_WELCOMEPAGE_TITLE "Selamat Datang di SIMANTU"
!define MUI_WELCOMEPAGE_TEXT "Setup wizard ini akan memandu Anda dalam proses instalasi SIMANTU (Sistem Informasi Pengumuman Terpadu) di komputer Anda.$\r$\n$\r$\nSIMANTU adalah aplikasi pengumuman terpadu bilingual (Indonesia-English) dengan Text-to-Speech yang dikembangkan untuk Universitas Gadjah Mada.$\r$\n$\r$\nDisarankan untuk menutup semua aplikasi lain sebelum melanjutkan.$\r$\n$\r$\nKlik Berikutnya untuk melanjutkan."

; ============================================================
; License Page (optional - shows terms)
; ============================================================
; !define MUI_LICENSEPAGE_TEXT_TOP "Silakan baca ketentuan penggunaan berikut."
; !insertmacro MUI_PAGE_LICENSE "LICENSE.txt"

; ============================================================  
; Directory Page
; ============================================================
!define MUI_DIRECTORYPAGE_TEXT_TOP "Setup akan menginstal SIMANTU ke direktori berikut. Klik Berikutnya untuk melanjutkan, atau klik Telusuri untuk memilih direktori lain."

; ============================================================
; Install Files Page
; ============================================================
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "Instalasi Selesai"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "SIMANTU telah berhasil diinstal di komputer Anda."
!define MUI_INSTFILESPAGE_ABORTHEADER_TEXT "Instalasi Dibatalkan"
!define MUI_INSTFILESPAGE_ABORTHEADER_SUBTEXT "Instalasi SIMANTU telah dibatalkan."

; ============================================================
; Finish Page
; ============================================================
!define MUI_FINISHPAGE_TITLE "SIMANTU Berhasil Diinstal!"
!define MUI_FINISHPAGE_TEXT "Aplikasi SIMANTU telah berhasil diinstal di komputer Anda.$\r$\n$\r$\nKlik Selesai untuk menutup wizard ini."
!define MUI_FINISHPAGE_RUN "$INSTDIR\SIMANTU.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Jalankan SIMANTU sekarang"
!define MUI_FINISHPAGE_RUN_CHECKED
!define MUI_FINISHPAGE_LINK "Universitas Gadjah Mada"
!define MUI_FINISHPAGE_LINK_LOCATION "https://ugm.ac.id"

; ============================================================
; Uninstall Welcome Page
; ============================================================
!define MUI_UNWELCOMEPAGE_TITLE "Hapus Instalasi SIMANTU"
!define MUI_UNWELCOMEPAGE_TEXT "Wizard ini akan menghapus SIMANTU dari komputer Anda.$\r$\n$\r$\nPastikan SIMANTU tidak sedang berjalan sebelum melanjutkan.$\r$\n$\r$\nKlik Berikutnya untuk melanjutkan."

; ============================================================
; Uninstall Finish Page
; ============================================================
!define MUI_UNFINISHPAGE_TITLE "SIMANTU Berhasil Dihapus"
!define MUI_UNFINISHPAGE_TEXT "SIMANTU telah berhasil dihapus dari komputer Anda."

; ============================================================
; Pages Order
; ============================================================
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; ============================================================
; Language - Indonesian
; ============================================================
!insertmacro MUI_LANGUAGE "Indonesian"

; Override button texts
LangString MUI_TEXT_WELCOME_INFO_TITLE ${LANG_INDONESIAN} "Selamat Datang"
LangString MUI_TEXT_FINISH_INFO_TITLE ${LANG_INDONESIAN} "Instalasi Selesai"
