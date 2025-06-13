# Definisikan bulan dan tahun yang tetap
bulan = "01"
tahun = "2005"

# Loop untuk tanggal dari 1 hingga 30
for tanggal_int in range(1, 31):
  # Format tanggal menjadi dua digit (misalnya, 1 menjadi "01", 10 menjadi "10")
  if tanggal_int < 10:
    tanggal_str = "0" + str(tanggal_int)
  else:
    tanggal_str = str(tanggal_int)

  # Gabungkan tanggal, bulan, dan tahun
  hasil_string = tanggal_str + bulan + tahun

  # Cetak hasil string
  print(hasil_string)