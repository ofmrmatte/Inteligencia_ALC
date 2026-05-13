Set shell = CreateObject("WScript.Shell")
repoPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
repoPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(repoPath)
command = "cmd.exe /c cd /d """ & repoPath & """ && npm run sync:dashboard"
shell.Run command, 0, False
