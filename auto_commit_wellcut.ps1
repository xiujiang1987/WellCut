# Change directory to the repository
Set-Location "D:\AI_Park\Github_Project\personal_projects\WellCut"

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
    git push origin main
    Write-Host "Changes pushed to origin/main."
} else {
    Write-Host "No changes to commit."
}
