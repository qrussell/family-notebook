# 1. Dynamically find the parent folder and define the zip file path
$ParentDir = (Get-Item .).Parent.FullName
$ZipName = "$ParentDir\family-notebook.zip"

if (Test-Path $ZipName) { Remove-Item $ZipName -Force }

# 2. Create a temporary staging directory right on your C: drive
$TempRoot = "C:\temp_fn_build"
$PluginFolder = "$TempRoot\family-notebook"
if (Test-Path $TempRoot) { Remove-Item $TempRoot -Recurse -Force }
New-Item -ItemType Directory -Path $PluginFolder -Force | Out-Null

Write-Host "Copying production files..." -ForegroundColor Cyan

# 3. Copy files from your CURRENT directory
Copy-Item -Path ".\family-notebook.php" -Destination $PluginFolder
Copy-Item -Path ".\readme.md" -Destination $PluginFolder -ErrorAction SilentlyContinue
Copy-Item -Path ".\build" -Destination $PluginFolder -Recurse
Copy-Item -Path ".\assets" -Destination $PluginFolder -Recurse -ErrorAction SilentlyContinue

Write-Host "Manually compiling Linux-friendly ZIP headers..." -ForegroundColor Cyan

# 4. THE ULTIMATE FIX: Manually build the zip and force forward slashes
Add-Type -AssemblyName System.IO.Compression.FileSystem
$ZipArchive = [System.IO.Compression.ZipFile]::Open($ZipName, [System.IO.Compression.ZipArchiveMode]::Create)

$Files = Get-ChildItem -Path $TempRoot -Recurse -File
foreach ($File in $Files) {
    # Calculate the relative path from the temp root
    $RelativePath = $File.FullName.Substring($TempRoot.Length + 1)
    
    # FORCE the path separator to be a forward slash (Linux/WordPress standard)
    $LinuxFriendlyPath = $RelativePath -replace '\\', '/'

    # Inject the file into the zip with the correct Linux-friendly path
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($ZipArchive, $File.FullName, $LinuxFriendlyPath) | Out-Null
}

# Close and save the zip
$ZipArchive.Dispose()

# 5. Clean up the temporary staging folder
Remove-Item -Path $TempRoot -Recurse -Force

Write-Host "Success! Your cross-platform WordPress plugin zip is ready at:" -ForegroundColor Green
Write-Host $ZipName -ForegroundColor Yellow