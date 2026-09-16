/**
 * MarkiCab Explore Catalog — single content source.
 * Data-driven: renderer reads window.EXPLORE_CATALOG.
 * Update content here only; no application logic changes needed.
 *
 * Schema per trip:
 *   id, title, destination, duration (days), type, summary, description,
 *   why[] (editorial reasons), days[{day, title, items[{time, title, note}]}],
 *   cover (image path), featured, order
 *
 * All destinations and routes are real, verifiable places in Indonesia.
 * Images sourced from Wikimedia Commons (CC0/CC-BY/CC-BY-SA).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (typeof window !== 'undefined') window.EXPLORE_CATALOG = mod;
  if (typeof globalThis !== 'undefined') globalThis.EXPLORE_CATALOG = mod;
})(this, function () {
  'use strict';

  return [
    {
      id: 'dieng-weekend',
      title: 'Dingin-dingin ke Dieng',
      destination: 'Dieng, Jawa Tengah',
      duration: 3,
      type: 'road-trip',
      summary: 'Sunrise di Sikunir, telaga warna, dan kawah Sikidang dalam satu weekend.',
      description: 'Dataran tinggi Dieng menawarkan pengalaman yang berbeda dari kebanyakan destinasi di Jawa. Bukan pantai, bukan hutan — tapi dataran tinggi dengan kawah aktif, telaga warna, dan kompleks candi tertua di Jawa. Trip ini dirancang untuk menikmati sunrise di Bukit Sikunir, menjelajahi Telaga Warna dan Telaga Pengilon, serta melihat kawah Sikidang yang masih aktif.',
      why: [
        'Sunrise di Bukit Sikunir adalah salah satu yang terbaik di Jawa',
        'Telaga Warna dan Telaga Pengilon menawarkan pemandangan danau vulkanik yang unik',
        'Kompleks Candi Arjuna adalah candi Hindu tertua di Jawa Tengah',
        'Sikidang Crater menunjukkan aktivitas vulkanik yang masih aktif'
      ],
      days: [
        { day: 1, title: 'Sunrise & Telaga', items: [
          { time: '04:00', title: 'Sunrise di Bukit Sikunir', note: 'Hiking 30-45 menit dari parkir' },
          { time: '07:00', title: 'Telaga Warna & Telaga Pengilon', note: 'Danau vulkanik dengan warna yang berubah' },
          { time: '10:00', title: 'Sikidang Crater', note: 'Kawah aktif dengan uap belerang' },
          { time: '14:00', title: 'Kompleks Candi Arjuna', note: 'Candi Hindu tertua di Jawa Tengah' }
        ]},
        { day: 2, title: 'Eksplorasi & Relaksasi', items: [
          { time: '08:00', title: 'Telaga Merdada', note: 'Danau tenang dengan pemandangan pegunungan' },
          { time: '11:00', title: 'Kebun Teh Tambi', note: 'Perkebunan teh dengan udara sejuk' },
          { time: '15:00', title: 'Kembali ke Wonosobo', note: 'Makan malam dan istirahat' }
        ]},
        { day: 3, title: 'Perjalanan Pulang', items: [
          { time: '09:00', title: 'Sarapan & Checkout', note: 'Persiapan pulang' },
          { time: '12:00', title: 'Makan Siang di Wonosobo', note: 'Kuliner lokal sebelum pulang' }
        ]}
      ],
      cover: 'assets/trip-bg/gunung.webp',
      featured: true,
      order: 1
    },
    {
      id: 'pantai-selatan-jogja',
      title: 'Pantai Selatan Yogyakarta',
      destination: 'Gunung Kidul, Yogyakarta',
      duration: 2,
      type: 'road-trip',
      summary: 'Baron, Kukup, Sundak, dan Drini — pantai selatan yang dramatis.',
      description: 'Pantai selatan Yogyakarta menawarkan garis pantai dramatis dengan tebing karst, pasir putih, dan ombak besar. Trip ini mengunjungi beberapa pantai terbaik di Gunung Kidul dalam dua hari, dengan waktu untuk menikmati sunset dan menjelajahi goa-goa kecil di sepanjang pantai.',
      why: [
        'Pantai Baron dan Kukup adalah ikon pantai selatan Jogja',
        'Sundak Beach menawarkan pasir putih dan ombak yang tenang',
        'Drini Beach cocok untuk snorkeling dan bermain air',
        'Sunset di pantai selatan adalah pengalaman yang tidak terlupakan'
      ],
      days: [
        { day: 1, title: 'Pantai Barat', items: [
          { time: '08:00', title: 'Pantai Baron', note: 'Pantai dengan ombak besar dan tebing karst' },
          { time: '11:00', title: 'Pantai Kukup', note: 'Pasir putih dan air jernih' },
          { time: '14:00', title: 'Pantai Sundak', note: 'Pantai tenang untuk berenang' },
          { time: '17:00', title: 'Sunset di Pantai Drini', note: 'Pantai dengan pemandangan matahari terbenam' }
        ]},
        { day: 2, title: 'Pantai Timur & Goa', items: [
          { time: '08:00', title: 'Pantai Indrayanti', note: 'Pantai dengan pasir putih dan air tenang' },
          { time: '11:00', title: 'Gua Jomblang', note: 'Gua vertikal dengan cahaya surga (opsional)' },
          { time: '15:00', title: 'Pantai Ngobaran', note: 'Pantai dengan pemandangan karst' }
        ]}
      ],
      cover: 'assets/trip-bg/pantai.webp',
      featured: true,
      order: 2
    },
    {
      id: 'bromo-sunrise',
      title: 'Bromo Sunrise & Madakaripura',
      destination: 'Tengger, Jawa Timur',
      duration: 2,
      type: 'mountain',
      summary: 'Sunrise di Penanjakan, lautan pasir, dan air terjun Madakaripura.',
      description: 'Gunung Bromo adalah salah satu ikon alam Indonesia yang paling terkenal. Trip ini dimulai dengan sunrise di Penanjakan, dilanjutkan dengan menyeberangi Lautan Pasir, dan diakhiri dengan mengunjungi Air Terjun Madakaripura — air tertinggi di Jawa Timur.',
      why: [
        'Sunrise di Penanjakan menawarkan pemandangan Bromo, Semeru, dan lautan pasir',
        'Lautan Pasir Bromo adalah pemandangan vulkanik yang unik',
        'Madakaripura adalah air terjun tertinggi di Jawa Timur (200m)',
        'Pengalaman berkuda di lautan pasir adalah momen yang tidak terlupakan'
      ],
      days: [
        { day: 1, title: 'Sunrise & Kawah', items: [
          { time: '03:30', title: 'Penanjakan Sunrise Point', note: 'Jeep dari Cemoro Lawang' },
          { time: '07:00', title: 'Lautan Pasir & Kawah Bromo', note: 'Berkuda atau jalan kaki' },
          { time: '10:00', title: 'Bromo Crater Rim', note: 'Lihat kawah aktif dari tepi' },
          { time: '14:00', title: 'Madakaripura Waterfall', note: 'Air terjun 200m, trekking 30 menit' }
        ]},
        { day: 2, title: 'Eksplorasi & Pulang', items: [
          { time: '08:00', title: 'Taman Nasional Bromo', note: 'Jelajah area taman nasional' },
          { time: '12:00', title: 'Makan Siang di Cemoro Lawang', note: 'Kuliner lokal' }
        ]}
      ],
      cover: 'assets/trip-bg/gunung.webp',
      featured: true,
      order: 3
    },
    {
      id: 'bandung-highland',
      title: 'Bandung Highland Escape',
      destination: 'Bandung, Jawa Barat',
      duration: 2,
      type: 'mountain',
      summary: 'Tangkuban Perahu, Kawah Putih, dan Dusun Bambu dalam dua hari.',
      description: 'Bandung menawarkan kombinasi sempurna antara vulkanik, kebun teh, dan arsitektur kolonial. Trip ini mengunjungi Tangkuban Perahu — gunung aktif yang bisa dilihat dari dekat, Kawah Putih — danau kawah dengan air berwarna putih kehijauan, dan Dusun Bambu — area rekreasi dengan pemandangan pegunungan.',
      why: [
        'Tangkuban Perahu adalah gunung aktif yang bisa dilihat dari dekat',
        'Kawah Putih menawarkan danau kawah dengan air berwarna putih kehijauan',
        'Dusun Bambu menawarkan pemandangan pegunungan dan arsitektur tradisional',
        'Kebun teh dan perkebunan strawberry menambah pengalaman'
      ],
      days: [
        { day: 1, title: 'Vulkanik Bandung', items: [
          { time: '06:00', title: 'Tangkuban Perahu', note: 'Lihat kawah aktif dari tepi' },
          { time: '10:00', title: 'Kawah Putih', note: 'Danau kawah dengan air berwarna putih' },
          { time: '14:00', title: 'Dusun Bambu', note: 'Rekreasi dengan pemandangan pegunungan' }
        ]},
        { day: 2, title: 'Kuliner & Budaya', items: [
          { time: '08:00', title: 'Kebun Teh Sukawana', note: 'Perkebunan teh dengan pemandangan' },
          { time: '12:00', title: 'Makan Siang di Bandung', note: 'Kuliner khas Bandung' },
          { time: '15:00', title: 'Braga & Kota Tua', note: 'Jelajah arsitektur kolonial' }
        ]}
      ],
      cover: 'assets/trip-bg/kota.webp',
      featured: false,
      order: 4
    },
    {
      id: 'borobudur-prambanan',
      title: 'Candi Borobudur & Prambanan',
      destination: 'Yogyakarta, Jawa Tengah',
      duration: 2,
      type: 'culture',
      summary: 'Sunrise di Borobudur, Prambanan, dan Kalibiru dalam dua hari.',
      description: 'Yogyakarta adalah pusat budaya Jawa dengan dua candi terbesar di Indonesia. Trip ini mengunjungi Candi Borobudur — candi Buddha terbesar di dunia, Candi Prambanan — candi Hindu terbesar di Indonesia, dan Kalibiru — bukit dengan pemandangan pegunungan dan hutan.',
      why: [
        'Borobudur adalah candi Buddha terbesar di dunia (UNESCO)',
        'Prambanan adalah candi Hindu terbesar di Indonesia',
        'Sunrise di Borobudur menawarkan pemandangan yang tidak terlupakan',
        'Kalibiru menawarkan pemandangan pegunungan dan hutan yang indah'
      ],
      days: [
        { day: 1, title: 'Borobudur & Prambanan', items: [
          { time: '04:00', title: 'Sunrise di Borobudur', note: 'Tiket sunrise, lihat candi dari atas' },
          { time: '09:00', title: 'Jelajah Borobudur', note: 'Lihat relief dan stupa' },
          { time: '14:00', title: 'Prambanan', note: 'Candi Hindu terbesar di Indonesia' }
        ]},
        { day: 2, title: 'Kaliburu & Kuliner', items: [
          { time: '06:00', title: 'Kalibiru', note: 'Bukit dengan pemandangan pegunungan' },
          { time: '12:00', title: 'Makan Siang di Yogyakarta', note: 'Gudeg dan kuliner khas Jogja' },
          { time: '15:00', title: 'Malioboro', note: 'Belanja dan jelajah kota' }
        ]}
      ],
      cover: 'assets/trip-bg/budaya.webp',
      featured: false,
      order: 5
    },
    {
      id: 'karimunjawa-island',
      title: 'Karimunjawa Island Hopping',
      destination: 'Karimunjawa, Jawa Tengah',
      duration: 3,
      type: 'island',
      summary: 'Snorkeling, island hopping, dan pantai pasir putih di Kepulauan Karimunjawa.',
      description: 'Karimunjawa adalah kepulauan di Laut Jawa dengan air jernih, terumbu karang, dan pantai pasir putih. Trip ini mengunjungi beberapa terbaik: Menjangan Kecil untuk snorkeling, Cemara Besar untuk pantai, dan Gosong Semut untuk spot snorkeling terbaik.',
      why: [
        'Menjangan Kecil menawarkan snorkeling dengan terumbu karang yang indah',
        'Cemara Besar menawarkan pantai pasir putih dan air tenang',
        'Gosong Semut adalah spot snorkeling terbaik di Karimunjawa',
        'Air jernih dan visibilitas tinggi membuat setiap snorkeling berkesan'
      ],
      days: [
        { day: 1, title: 'Island Hopping', items: [
          { time: '08:00', title: 'Menjangan Kecil', note: 'Snorkeling di terumbu karang' },
          { time: '12:00', title: 'Cemara Besar', note: 'Pantai pasir putih dan makan siang' },
          { time: '15:00', title: 'Gosong Semut', note: 'Snorkeling di spot terbaik' }
        ]},
        { day: 2, title: 'Pantai & Relaksasi', items: [
          { time: '08:00', title: 'Pantai Tanjung Gelam', note: 'Pantai dengan air tenang' },
          { time: '12:00', title: 'Makan Siang di Pulau Menjangan', note: 'Kuliner laut' },
          { time: '15:00', title: 'Snorkeling Bebas', note: 'Jelajah perairan sekitar resort' }
        ]},
        { day: 3, title: 'Pulang', items: [
          { time: '08:00', title: 'Sarapan & Checkout', note: 'Persiapan pulang' },
          { time: '12:00', title: 'Ke Pelabuhan Jepara', note: 'Ferry kembali ke Jepara' }
        ]}
      ],
      cover: 'assets/trip-bg/laut.webp',
      featured: false,
      order: 6
    },
    {
      id: 'sumba-east',
      title: 'Sumba Timur: Walakiri & Weekuri',
      destination: 'Sumba Timur, NTT',
      duration: 4,
      type: 'road-trip',
      summary: 'Walakiri Beach, Weekuri Lake, dan Ratenggaro Village dalam empat hari.',
      description: 'Sumba menawarkan pengalaman yang berbeda dari destinasi populer lainnya. Trip ini mengunjungi Pantai Walakiri — pantai dengan pohon bakau yang ikonik, Danau Weekuri — danau asin dengan air jernih, dan Desa Ratenggaro — desa tradisional dengan rumah adat yang masih terjaga.',
      why: [
        'Walakiri Beach menawarkan pemandangan pohon bakau yang ikonik saat sunset',
        'Weekuri Lake adalah danau asin dengan air jernih yang cocok untuk berenang',
        'Ratenggaro Village menawarkan pengalaman budaya Sumba yang autentik',
        'Sumba menawarkan pengalaman yang berbeda dari destinasi populer lainnya'
      ],
      days: [
        { day: 1, title: 'Perjalanan & Walakiri', items: [
          { time: '08:00', title: 'Tiba di Waingapu', note: 'Penerbangan dari Bali' },
          { time: '14:00', title: 'Walakiri Beach', note: 'Sunset di pantai dengan pohon bakau' }
        ]},
        { day: 2, title: 'Weekuri & Ratenggaro', items: [
          { time: '08:00', title: 'Weekuri Lake', note: 'Danau asin dengan air jernih' },
          { time: '14:00', title: 'Ratenggaro Village', note: 'Desa tradisional dengan rumah adat' }
        ]},
        { day: 3, title: 'Eksplorasi', items: [
          { time: '08:00', title: 'Pantai Mandorak', note: 'Pantai dengan air tenang' },
          { time: '14:00', title: 'Air Terjun Lapopu', note: 'Air terjun dengan pemandangan hutan' }
        ]},
        { day: 4, title: 'Pulang', items: [
          { time: '08:00', title: 'Sarapan & Checkout', note: 'Persiapan pulang' },
          { time: '12:00', title: 'Ke Bandara Waingapu', note: 'Penerbangan kembali' }
        ]}
      ],
      cover: 'assets/trip-bg/alam.webp',
      featured: false,
      order: 7
    },
    {
      id: 'toraja-cultural',
      title: 'Tana Toraja: Budaya & Pemakaman',
      destination: 'Tana Toraja, Sulawesi Selatan',
      duration: 3,
      type: 'culture',
      summary: 'Londa Burial Caves, Ke\'te Kesu, dan Lemo dalam tiga hari.',
      description: 'Tana Toraja menawarkan pengalaman budaya yang unik dengan tradisi pemakaman yang masih terjaga. Trip ini mengunjungi Gua Londa — gua pemakaman dengan mayat yang masih terjaga, Desa Ke\'te Kesu — desa tradisional dengan rumah adat, dan Lemo — tebing pemakaman dengan patung tau-tau.',
      why: [
        'Londa Burial Caves menawarkan pengalaman unik tentang tradisi pemakaman Toraja',
        'Ke\'te Kesu adalah desa tradisional dengan rumah adat yang masih terjaga',
        'Lemo menawarkan pemandangan tebing pemakaman dengan patung tau-tau',
        'Budaya Toraja adalah salah satu yang paling unik di Indonesia'
      ],
      days: [
        { day: 1, title: 'Perjalanan & Ke\'te Kesu', items: [
          { time: '08:00', title: 'Tiba di Rantepao', note: 'Penerbangan dari Makassar' },
          { time: '14:00', title: 'Desa Ke\'te Kesu', note: 'Desa tradisional dengan rumah adat' }
        ]},
        { day: 2, title: 'Pemakaman & Budaya', items: [
          { time: '08:00', title: 'Londa Burial Caves', note: 'Gua pemakaman dengan mayat yang masih terjaga' },
          { time: '12:00', title: 'Lemo', note: 'Tebing pemakaman dengan patung tau-tau' },
          { time: '15:00', title: 'Pasar Rantepao', note: 'Pasar tradisional Toraja' }
        ]},
        { day: 3, title: 'Eksplorasi & Pulang', items: [
          { time: '08:00', title: 'Buntu Burake', note: 'Patung Yesus tertinggi di dunia' },
          { time: '12:00', title: 'Makan Siang di Rantepao', note: 'Kuliner khas Toraja' }
        ]}
      ],
      cover: 'assets/trip-bg/budaya.webp',
      featured: false,
      order: 8
    },
    {
      id: 'wae-rebo-trek',
      title: 'Wae Rebo: Trek ke Desa Tradisional',
      destination: 'Flores, NTT',
      duration: 3,
      type: 'nature',
      summary: 'Trek ke Wae Rebo, desa tradisional Mbaru Niang di Flores.',
      description: 'Wae Rebo adalah desa tradisional di Flores yang hanya bisa dicapai dengan trekking. Desa ini menawarkan pengalaman unik tentang kehidupan masyarakat tradisional yang masih terjaga, dengan rumah adat Mbaru Niang yang khas.',
      why: [
        'Wae Rebo adalah salah satu desa tradisional paling terpencil di Indonesia',
        'Rumah adat Mbaru Niang adalah arsitektur tradisional yang unik',
        'Trekking melalui hutan dan pegunungan menawarkan pemandangan yang indah',
        'Pengalaman budaya yang autentik dan berbeda dari destinasi populer'
      ],
      days: [
        { day: 1, title: 'Perjalanan & Trek', items: [
          { time: '08:00', title: 'Labuan Bajo ke Denge', note: 'Perjalanan darat 4-5 jam' },
          { time: '14:00', title: 'Trek ke Wae Rebo', note: 'Trekking 3-4 jam melalui hutan' }
        ]},
        { day: 2, title: 'Desa & Budaya', items: [
          { time: '08:00', title: 'Jelajah Desa Wae Rebo', note: 'Lihat rumah adat Mbaru Niang' },
          { time: '12:00', title: 'Makan Bersama Warga', note: 'Kuliner lokal' },
          { time: '15:00', title: 'Trek Kembali ke Denge', note: 'Perjalanan pulang' }
        ]},
        { day: 3, title: 'Pulang', items: [
          { time: '08:00', title: 'Sarapan & Checkout', note: 'Persiapan pulang' },
          { time: '12:00', title: 'Kembali ke Labuan Bajo', note: 'Perjalanan darat' }
        ]}
      ],
      cover: 'assets/trip-bg/alam.webp',
      featured: false,
      order: 9
    },
    {
      id: 'sawahlunto-heritage',
      title: 'Sawahlunto: Warisan Tambang Ombilin',
      destination: 'Sawahlunto, Sumatera Barat',
      duration: 2,
      type: 'culture',
      summary: 'Warisan tambang batu bara UNESCO dan museum lokal dalam dua hari.',
      description: 'Sawahlunto adalah kota tambang batu bara bersejarah yang terdaftar sebagai Warisan Dunia UNESCO. Trip ini mengunjungi Museum Goedang Ransoem, Lubang Tambang Mbah Soero, dan kota tua dengan arsitektur kolonial yang masih terjaga.',
      why: [
        'Ombilin Coal Mining Heritage adalah Warisan Dunia UNESCO',
        'Museum Goedang Ransoem menawarkan koleksi alat tambang bersejarah',
        'Lubang Tambang Mbah Soero menawarkan pengalaman tur tambang bawah tanah',
        'Kota tua Sawahlunto menawarkan arsitektur kolonial yang masih terjaga'
      ],
      days: [
        { day: 1, title: 'Museum & Tambang', items: [
          { time: '08:00', title: 'Museum Goedang Ransoem', note: 'Koleksi alat tambang bersejarah' },
          { time: '12:00', title: 'Lubang Tambang Mbah Soero', note: 'Tur tambang bawah tanah' },
          { time: '15:00', title: 'Kota Tua Sawahlunto', note: 'Arsitektur kolonial' }
        ]},
        { day: 2, title: 'Eksplorasi & Pulang', items: [
          { time: '08:00', title: 'Museum Kereta Api', note: 'Koleksi kereta api bersejarah' },
          { time: '12:00', title: 'Makan Siang di Sawahlunto', note: 'Kuliner khas Minangkabau' }
        ]}
      ],
      cover: 'assets/trip-bg/kota.webp',
      featured: false,
      order: 10
    },
    {
      id: 'jogja-solo-kuliner',
      title: 'Jogja-Solo: Rute Kuliner',
      destination: 'Yogyakarta & Solo, Jawa Tengah',
      duration: 2,
      type: 'food',
      summary: 'Gudeg, Sate Klathak, dan Nasi Liwet dalam dua hari kuliner.',
      description: 'Yogyakarta dan Solo menawarkan beberapa kuliner paling ikonik di Indonesia. Trip ini mengunjungi tempat-tempat terbaik untuk gudeg, sate klathak, nasi liwet, dan kuliner lainnya dalam dua hari.',
      why: [
        'Gudeg adalah makanan khas Yogyakarta yang wajib dicoba',
        'Sate Klathak adalah sate khas Solo yang unik',
        'Nasi Liwet adalah makanan khas Solo yang lezat',
        'Rute kuliner ini menawarkan pengalaman yang berbeda dari trip biasa'
      ],
      days: [
        { day: 1, title: 'Yogyakarta', items: [
          { time: '08:00', title: 'Gudeg Yu Djum', note: 'Gudeg legendaris di Jogja' },
          { time: '12:00', title: 'Sate Klathak Pak Bambang', note: 'Sate khas Solo' },
          { time: '15:00', title: 'Bakpia Pathok', note: 'Oleh-oleh khas Jogja' }
        ]},
        { day: 2, title: 'Solo', items: [
          { time: '08:00', title: 'Nasi Liwet Bu Sastro', note: 'Nasi liwet khas Solo' },
          { time: '12:00', title: 'Serabi Solo', note: 'Makanan tradisional Solo' },
          { time: '15:00', title: 'Pasar Klewer', note: 'Pasar tekstil dan kuliner' }
        ]}
      ],
      cover: 'assets/trip-bg/kuliner.webp',
      featured: false,
      order: 11
    },
    {
      id: 'jalan-pesisir',
      title: 'Jalan Pesisir: Drini & Indrayanti',
      destination: 'Gunung Kidul, Yogyakarta',
      duration: 1,
      type: 'road-trip',
      summary: 'Sunrise di Drini Beach dan Indrayanti dalam satu hari.',
      description: 'Pantai selatan Yogyakarta menawarkan pemandangan dramatis dengan tebing karst dan pasir putih. Trip satu hari ini mengunjungi Drini Beach untuk sunrise dan Indrayanti untuk snorkeling dan berenang.',
      why: [
        'Drini Beach menawarkan sunrise yang indah',
        'Indrayanti menawarkan snorkeling dan pantai pasir putih',
        'Satu hari sudah cukup untuk menikmati pantai selatan Jogja',
        'Cocok untuk trip singkat dari kota'
      ],
      days: [
        { day: 1, title: 'Pantai Selatan', items: [
          { time: '05:00', title: 'Sunrise di Drini Beach', note: 'Pantai dengan pemandangan matahari terbit' },
          { time: '08:00', title: 'Indrayanti Beach', note: 'Snorkeling dan berenang' },
          { time: '12:00', title: 'Makan Siang di Pantai', note: 'Kuliner laut' },
          { time: '15:00', title: 'Kembali ke Yogyakarta', note: 'Perjalanan pulang' }
        ]}
      ],
      cover: 'assets/trip-bg/pantai.webp',
      featured: false,
      order: 12
    }
  ];
});
