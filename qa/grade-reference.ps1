# 外部渠道测试用：把游戏截图按 src/pod/net/video.ts 的 REFERENCE_GRADE 压暗，与游戏实际提交的环境参考帧一致。
# 等效于 CSS brightness(0.5) contrast(0.85) saturate(0.55)，再叠 rgba(4,12,24,0.38) 浑水。
# 用法：powershell -ExecutionPolicy Bypass -File qa/grade-reference.ps1 <截图路径>  → 同目录输出 *-graded.jpg
param([Parameter(Mandatory = $true)][string]$Path)
Add-Type -AssemblyName System.Drawing

$s = 0.55; $k = 0.62 * 0.85 * 0.5
$off = @((0.62 * 0.075 + 0.38 * 4 / 255), (0.62 * 0.075 + 0.38 * 12 / 255), (0.62 * 0.075 + 0.38 * 24 / 255))
# CSS saturate 矩阵（行 = 输出通道，列 = 输入通道）
$S = @(
  @((0.213 + 0.787 * $s), (0.715 - 0.715 * $s), (0.072 - 0.072 * $s)),
  @((0.213 - 0.213 * $s), (0.715 + 0.285 * $s), (0.072 - 0.072 * $s)),
  @((0.213 - 0.213 * $s), (0.715 - 0.715 * $s), (0.072 + 0.928 * $s))
)
$m = New-Object System.Drawing.Imaging.ColorMatrix
# GDI+ 为行向量乘矩阵：Matrix[输入, 输出]
for ($o = 0; $o -lt 3; $o++) { for ($i = 0; $i -lt 3; $i++) { $m[$i, $o] = [single]($k * $S[$o][$i]) } ; $m[4, $o] = [single]$off[$o] }
$m[3, 3] = 1; $m[4, 4] = 1

$src = [System.Drawing.Image]::FromFile((Resolve-Path $Path))
$dst = New-Object System.Drawing.Bitmap $src.Width, $src.Height
$g = [System.Drawing.Graphics]::FromImage($dst)
$attr = New-Object System.Drawing.Imaging.ImageAttributes
$attr.SetColorMatrix($m)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $src.Width, $src.Height), 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
$out = [IO.Path]::Combine([IO.Path]::GetDirectoryName((Resolve-Path $Path)), [IO.Path]::GetFileNameWithoutExtension($Path) + '-graded.jpg')
$dst.Save($out, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose(); $dst.Dispose(); $src.Dispose()
Write-Output $out
