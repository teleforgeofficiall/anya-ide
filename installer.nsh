!macro customInit
  nsExec::ExecToStack 'cmd.exe /C tasklist /FI "IMAGENAME eq Anya IDE.exe" /NH | findstr /I "Anya IDE.exe"'
  Pop $0
  Pop $1

  ${If} $0 == 0
    MessageBox MB_OK|MB_ICONSTOP \
      "Anya IDE is currently running!$\r$\n$\r$\nPlease close it completely before installing a new version:$\r$\n$\r$\n  1. Press Ctrl+Shift+Esc to open Task Manager$\r$\n  2. Find 'Anya IDE' or 'Anya IDE.exe'$\r$\n  3. Right-click on it → 'End Task'$\r$\n$\r$\nThen run this installer again."
    Abort
  ${EndIf}
!macroend
