# Change directory to the repository
Set-Location "D:\Github_Project\WellCut"

# Stage all changes
git add .

# Check if there are changes staged for commit
$status = git status --porcelain
if ($status) {
    # Create commit message with timestamp
    $commitMessage = "Auto-commit $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

    # Commit the changes
    git commit -m $commitMessage
    Write-Host "Changes committed: $commitMessage"

    # Push the changes to the remote repository
    # Note: Assumes remote 'origin' and branch 'main' will be set up later.
    # git push origin main
    # Write-Host "Attempted push to origin/main."
} else {
    Write-Host "No changes to commit."
}
