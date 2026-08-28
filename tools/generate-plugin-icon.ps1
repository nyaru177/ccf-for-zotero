param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\addon\content\icons")
)

Add-Type -AssemblyName System.Drawing

function New-PluginIcon {
  param(
    [int]$Size,
    [string]$Path
  )

  $bitmap = New-Object System.Drawing.Bitmap(
    $Size,
    $Size,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $scale = $Size / 96.0
  $graphics.ScaleTransform($scale, $scale)

  function New-DocumentPath([double]$offsetX, [double]$offsetY) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddLine(21 + $offsetX, 11.5 + $offsetY, 26.5 + $offsetX, 6 + $offsetY)
    $path.AddLine(57 + $offsetX, 6 + $offsetY, 75 + $offsetX, 23.5 + $offsetY)
    $path.AddLine(75 + $offsetX, 78 + $offsetY, 69.5 + $offsetX, 83.5 + $offsetY)
    $path.AddLine(21.5 + $offsetX, 83.5 + $offsetY, 16 + $offsetX, 78 + $offsetY)
    $path.AddLine(16 + $offsetX, 17 + $offsetY, 21 + $offsetX, 11.5 + $offsetY)
    $path.CloseFigure()
    return $path
  }

  $shadowPath = New-DocumentPath 2 3
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(42, 16, 42, 65))
  $graphics.FillPath($shadowBrush, $shadowPath)
  $shadowBrush.Dispose()
  $shadowPath.Dispose()

  $documentPath = New-DocumentPath 0 0
  $paperBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
  $outlinePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 22, 50, 79), 3)
  $graphics.FillPath($paperBrush, $documentPath)
  $graphics.DrawPath($outlinePen, $documentPath)
  $paperBrush.Dispose()
  $outlinePen.Dispose()
  $documentPath.Dispose()

  $fold = New-Object System.Drawing.Drawing2D.GraphicsPath
  $fold.AddLine(57, 7, 57, 21)
  $fold.AddArc(57, 21, 4, 4, 270, 90)
  $fold.AddLine(61, 25, 73, 25)
  $foldPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 22, 50, 79), 3)
  $graphics.DrawPath($foldPen, $fold)
  $foldPen.Dispose()
  $fold.Dispose()

  $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 123, 135, 148), 4)
  $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($linePen, 28, 34, 59, 34)
  $graphics.DrawLine($linePen, 28, 45, 63, 45)
  $graphics.DrawLine($linePen, 28, 56, 53, 56)
  $linePen.Dispose()

  $ccfLinePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 214, 69, 69), 4)
  $ccfLinePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $ccfLinePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($ccfLinePen, 28, 34, 43, 34)
  $ccfLinePen.Dispose()
  $casLinePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 22, 156, 156), 4)
  $casLinePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $casLinePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($casLinePen, 28, 56, 41, 56)
  $casLinePen.Dispose()

  $whitePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 3)
  $ccfBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 214, 69, 69))
  $casBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 22, 156, 156))
  $graphics.FillEllipse($ccfBrush, 18, 56, 32, 32)
  $graphics.DrawEllipse($whitePen, 18, 56, 32, 32)
  $graphics.FillEllipse($casBrush, 46, 56, 32, 32)
  $graphics.DrawEllipse($whitePen, 46, 56, 32, 32)
  $ccfBrush.Dispose()
  $casBrush.Dispose()
  $whitePen.Dispose()

  $badgeLinePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 3)
  $badgeLinePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $badgeLinePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($badgeLinePen, 25, 65, 41, 65)
  $graphics.DrawLine($badgeLinePen, 25, 72, 41, 72)
  $graphics.DrawLine($badgeLinePen, 25, 79, 35, 79)
  $badgeLinePen.Dispose()

  $checkPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 4)
  $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLines($checkPen, @([System.Drawing.PointF]::new(54, 72), [System.Drawing.PointF]::new(59, 77), [System.Drawing.PointF]::new(70, 64)))
  $checkPen.Dispose()

  $graphics.Dispose()
  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
New-PluginIcon 48 (Join-Path $OutputDirectory "ccf-cas-48.png")
New-PluginIcon 96 (Join-Path $OutputDirectory "ccf-cas-96.png")
