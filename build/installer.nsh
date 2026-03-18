; ============================================================
; SIMANTU - Custom NSIS Text Overrides
; electron-builder handles all MUI setup, pages, and language.
; All defines use !ifndef guard to prevent redefinition conflicts.
; ============================================================

!ifndef MUI_ABORTWARNING
!define MUI_ABORTWARNING
!endif
!ifndef MUI_UNABORTWARNING
!define MUI_UNABORTWARNING
!endif

!ifndef MUI_WELCOMEPAGE_TITLE
!define MUI_WELCOMEPAGE_TITLE "Selamat Datang di SIMANTU"
!endif
!ifndef MUI_WELCOMEPAGE_TEXT
!define MUI_WELCOMEPAGE_TEXT "Setup wizard ini akan memandu Anda dalam proses instalasi SIMANTU (Sistem Informasi Pengumuman Terpadu) di komputer Anda.$\r$\n$\r$\nSIMANTU adalah aplikasi pengumuman terpadu bilingual (Indonesia-English) dengan Text-to-Speech yang dikembangkan untuk Universitas Gadjah Mada.$\r$\n$\r$\nKlik Berikutnya untuk melanjutkan."
!endif

!ifndef MUI_DIRECTORYPAGE_TEXT_TOP
!define MUI_DIRECTORYPAGE_TEXT_TOP "Setup akan menginstal SIMANTU ke direktori berikut. Klik Berikutnya untuk melanjutkan, atau klik Telusuri untuk memilih direktori lain."
!endif

!ifndef MUI_INSTFILESPAGE_FINISHHEADER_TEXT
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "Instalasi Selesai"
!endif
!ifndef MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "SIMANTU telah berhasil diinstal di komputer Anda."
!endif
!ifndef MUI_INSTFILESPAGE_ABORTHEADER_TEXT
!define MUI_INSTFILESPAGE_ABORTHEADER_TEXT "Instalasi Dibatalkan"
!endif
!ifndef MUI_INSTFILESPAGE_ABORTHEADER_SUBTEXT
!define MUI_INSTFILESPAGE_ABORTHEADER_SUBTEXT "Instalasi SIMANTU telah dibatalkan."
!endif

!ifndef MUI_FINISHPAGE_TITLE
!define MUI_FINISHPAGE_TITLE "SIMANTU Berhasil Diinstal!"
!endif
!ifndef MUI_FINISHPAGE_TEXT
!define MUI_FINISHPAGE_TEXT "Aplikasi SIMANTU telah berhasil diinstal di komputer Anda.$\r$\n$\r$\nKlik Selesai untuk menutup wizard ini."
!endif

!ifndef MUI_UNWELCOMEPAGE_TITLE
!define MUI_UNWELCOMEPAGE_TITLE "Hapus Instalasi SIMANTU"
!endif
!ifndef MUI_UNWELCOMEPAGE_TEXT
!define MUI_UNWELCOMEPAGE_TEXT "Wizard ini akan menghapus SIMANTU dari komputer Anda.$\r$\n$\r$\nKlik Berikutnya untuk melanjutkan."
!endif

!ifndef MUI_UNFINISHPAGE_TITLE
!define MUI_UNFINISHPAGE_TITLE "SIMANTU Berhasil Dihapus"
!endif
!ifndef MUI_UNFINISHPAGE_TEXT
!define MUI_UNFINISHPAGE_TEXT "SIMANTU telah berhasil dihapus dari komputer Anda."
!endif
