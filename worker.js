const seedStudents = [
  [
    "Ada Yılmaz",
    "12-A",
    "Birlikte daha güzel.",
    "https://images.unsplash.com/photo-1544005313-94ddf028a43e?w=700"
  ],
  [
    "Arda Demir",
    "12-A",
    "Anı biriktir.",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=700"
  ],
  [
    "Ece Kaya",
    "12-A",
    "Gülümsemeyi unutma.",
    "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=700"
  ],
  [
    "Mert Şahin",
    "12-A",
    "İyi ki aynı sınıftaydık.",
    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=700"
  ],
  [
    "Elif Aydın",
    "12-B",
    "Her şey güzel olacak.",
    "https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=700"
  ],
  [
    "Can Eren",
    "12-B",
    "Yolun açık olsun.",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=700"
  ],
  [
    "Zeynep Arslan",
    "12-B",
    "Bu yılları unutma.",
    "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=700"
  ],
  [
    "Bora Çelik",
    "12-B",
    "Hep gül.",
    "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=700"
  ],
  [
    "Deniz Koç",
    "12-C",
    "Güzel anılar bizimle.",
    "https://images.unsplash.com/photo-1504593811423-6dd665756598?w=700"
  ],
  [
    "Nazlı Öz",
    "12-C",
    "İyi ki varsın.",
    "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=700"
  ],
  [
    "Emir Aksoy",
    "12-C",
    "Yeni başlangıçlara.",
    "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=700"
  ],
  [
    "Selin Tunç",
    "12-C",
    "Seni hep hatırlayacağız.",
    "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=700"
  ]
];

const json = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
};

async function body(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function getAdminPin(env) {
  return String(env.ADMIN_PIN || "2468");
}

function isAdmin(req, env) {
  return req.headers.get("x-admin-pin") === getAdminPin(env);
}

/* ---------------------------------
   VERİTABANI SEED
--------------------------------- */

async function ensureSeed(env) {
  const result = await env.ANDAC_DB
    .prepare("SELECT COUNT(*) AS c FROM students")
    .first();

  if (Number(result?.c || 0) === 0) {
    const statements = seedStudents.map((student) => {
      return env.ANDAC_DB
        .prepare(`
          INSERT INTO students
          (name, class_name, motto, photo, target)
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(
          student[0],
          student[1],
          student[2],
          student[3],
          5
        );
    });

    await env.ANDAC_DB.batch(statements);
  }
}

/* ---------------------------------
   ÖĞRENCİLER
--------------------------------- */

async function getStudents(env) {
  const result = await env.ANDAC_DB
    .prepare(`
      SELECT
        s.id,
        s.name,
        s.class_name,
        s.motto,
        s.photo,
        s.target,

        COUNT(
          CASE
            WHEN n.status = 'approved'
            THEN 1
          END
        ) AS approved_count,

        COUNT(n.id) AS total_notes

      FROM students s

      LEFT JOIN notes n
        ON n.student_id = s.id

      GROUP BY
        s.id,
        s.name,
        s.class_name,
        s.motto,
        s.photo,
        s.target

      ORDER BY
        s.class_name ASC,
        s.name ASC
    `)
    .all();

  return result.results || [];
}

/* ---------------------------------
   ANDAÇLAR
--------------------------------- */

async function getNotes(env, url, admin) {
  let sql = `
    SELECT
      n.id,
      n.student_id,
      n.writer_name,
      n.relationship,
      n.content,
      n.status,
      n.created_at,
      s.name AS student_name,
      s.class_name
    FROM notes n
    JOIN students s
      ON s.id = n.student_id
    WHERE 1 = 1
  `;

  const args = [];

  /*
    Genel kullanıcı sadece onaylanmış
    yazıları görebilir.
  */
  if (!admin) {
    sql += ` AND n.status = 'approved'`;
  } else {
    const status = url.searchParams.get("status");

    if (status && status !== "all") {
      sql += ` AND n.status = ?`;
      args.push(status);
    }
  }

  const student = url.searchParams.get("student");

  if (student) {
    sql += ` AND n.student_id = ?`;
    args.push(Number(student));
  }

  const search = url.searchParams.get("search");

  if (search) {
    sql += `
      AND (
        lower(s.name) LIKE lower(?)
        OR lower(n.writer_name) LIKE lower(?)
        OR lower(n.content) LIKE lower(?)
      )
    `;

    const q = `%${search}%`;

    args.push(q, q, q);
  }

  sql += ` ORDER BY n.id DESC`;

  const result = await env.ANDAC_DB
    .prepare(sql)
    .bind(...args)
    .all();

  return result.results || [];
}

/* ---------------------------------
   CSV
--------------------------------- */

function makeCsv(rows) {
  const headers = [
    "Tarih",
    "Öğrenci",
    "Sınıf",
    "Yazar",
    "İlişki",
    "Yazı",
    "Durum"
  ];

  const values = rows.map((note) => [
    note.created_at,
    note.student_name,
    note.class_name,
    note.writer_name,
    note.relationship,
    note.content,
    note.status
  ]);

  const quote = (value) => {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  };

  return (
    "\ufeff" +
    [headers, ...values]
      .map((row) => row.map(quote).join(","))
      .join("\r\n")
  );
}

/* ---------------------------------
   EXCEL
--------------------------------- */

function makeExcel(rows) {
  const headers = [
    "Tarih",
    "Öğrenci",
    "Sınıf",
    "Yazar",
    "İlişki",
    "Yazı",
    "Durum"
  ];

  const escapeXml = (value) => {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  };

  let output = `<?xml version="1.0"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">

<Worksheet ss:Name="Andaclar">
<Table>
<Row>`;

  output += headers
    .map(
      (header) =>
        `<Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`
    )
    .join("");

  output += `</Row>`;

  for (const note of rows) {
    const values = [
      note.created_at,
      note.student_name,
      note.class_name,
      note.writer_name,
      note.relationship,
      note.content,
      note.status
    ];

    output += `<Row>`;

    output += values
      .map(
        (value) =>
          `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`
      )
      .join("");

    output += `</Row>`;
  }

  output += `
</Table>
</Worksheet>
</Workbook>`;

  return output;
}

/* ---------------------------------
   ANA ROUTER
--------------------------------- */

async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  /* Sağlık kontrolü */
  if (method === "GET" && path === "/api/health") {
    return json({
      ok: true,
      app: "andac-defteri"
    });
  }

  /* Veritabanını hazırla */
  await ensureSeed(env);

  /* ---------------------------------
     PUBLIC - ÖĞRENCİLER
  --------------------------------- */

  if (method === "GET" && path === "/api/students") {
    return json(await getStudents(env));
  }

  /* ---------------------------------
     PUBLIC - ONAYLANMIŞ ANDAÇLAR
  --------------------------------- */

  if (method === "GET" && path === "/api/notes") {
    const admin = isAdmin(req, env);

    /*
      Admin değilse sadece approved döner.
      Admin ise tüm kayıtları görebilir.
    */
    if (!admin) {
      const status = url.searchParams.get("status");

      /*
        Frontend public tarafta zaten
        ?status=approved gönderiyor.
      */
      if (status !== "approved") {
        return json(
          {
            error: "Yetkisiz"
          },
          401
        );
      }
    }

    return json(
      await getNotes(env, url, admin)
    );
  }

  /* ---------------------------------
     PUBLIC - ANDAÇ GÖNDER
  --------------------------------- */

  if (method === "POST" && path === "/api/notes") {
    const data = await body(req);

    const studentId = Number(data.student_id);

    const writerName = String(
      data.writer_name ||
      data.author_name ||
      ""
    ).trim();

    const relationship = String(
      data.relationship || ""
    ).trim();

    const content = String(
      data.content ||
      data.message ||
      ""
    ).trim();

    if (!studentId) {
      return json(
        {
          error: "Öğrenci seçilmedi."
        },
        400
      );
    }

    if (!writerName) {
      return json(
        {
          error: "Adınızı yazın."
        },
        400
      );
    }

    if (!content) {
      return json(
        {
          error: "Andaç yazısı boş bırakılamaz."
        },
        400
      );
    }

    if (content.length < 20) {
      return json(
        {
          error: "Andaç yazısı en az 20 karakter olmalı."
        },
        400
      );
    }

    if (content.length > 600) {
      return json(
        {
          error: "Andaç yazısı en fazla 600 karakter olabilir."
        },
        400
      );
    }

    const student = await env.ANDAC_DB
      .prepare(`
        SELECT id
        FROM students
        WHERE id = ?
      `)
      .bind(studentId)
      .first();

    if (!student) {
      return json(
        {
          error: "Öğrenci bulunamadı."
        },
        404
      );
    }

    const createdAt = new Date().toISOString();

    const result = await env.ANDAC_DB
      .prepare(`
        INSERT INTO notes
        (
          student_id,
          writer_name,
          relationship,
          content,
          status,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        studentId,
        writerName,
        relationship,
        content,
        "pending",
        createdAt
      )
      .run();

    return json({
      ok: true,
      id: result.meta.last_row_id,
      message: "Andaçınız başarıyla gönderildi."
    });
  }

  /* ---------------------------------
     ADMIN LOGIN
  --------------------------------- */

  if (method === "POST" && path === "/api/admin/login") {
    const data = await body(req);

    const pin = String(data.pin || "");

    if (pin === getAdminPin(env)) {
      return json({
        ok: true
      });
    }

    return json(
      {
        error: "PIN hatalı"
      },
      401
    );
  }

  /* ---------------------------------
     ADMIN KONTROLÜ
  --------------------------------- */

  if (path.startsWith("/api/") && !isAdmin(req, env)) {
    return json(
      {
        error: "Yetkisiz"
      },
      401
    );
  }

  /* ---------------------------------
     ADMIN - ANDAÇ DURUMU DEĞİŞTİR
  --------------------------------- */

  if (
    method === "PATCH" &&
    path.startsWith("/api/notes/")
  ) {
    const id = Number(
      path.split("/").pop()
    );

    const data = await body(req);

    const status = String(
      data.status || ""
    );

    if (
      !["pending", "approved", "rejected"].includes(
        status
      )
    ) {
      return json(
        {
          error: "Geçersiz durum."
        },
        400
      );
    }

    await env.ANDAC_DB
      .prepare(`
        UPDATE notes
        SET status = ?
        WHERE id = ?
      `)
      .bind(status, id)
      .run();

    return json({
      ok: true
    });
  }

  /* ---------------------------------
     ADMIN - ANDAÇ SİL
  --------------------------------- */

  if (
    method === "DELETE" &&
    path.startsWith("/api/notes/")
  ) {
    const id = Number(
      path.split("/").pop()
    );

    await env.ANDAC_DB
      .prepare(`
        DELETE FROM notes
        WHERE id = ?
      `)
      .bind(id)
      .run();

    return json({
      ok: true
    });
  }

  /* ---------------------------------
     ADMIN - YENİ ÖĞRENCİ
  --------------------------------- */

  if (
    method === "POST" &&
    path === "/api/students"
  ) {
    const data = await body(req);

    const name = String(
      data.name || ""
    ).trim();

    const className = String(
      data.class_name ||
      data.className ||
      ""
    ).trim();

    const motto = String(
      data.motto || ""
    ).trim();

    /*
      photo_url sadece dışarıdan gelen eski
      form verisi için alternatif isimdir.
      D1 sütunu kesinlikle PHOTO'dur.
    */
    const photo = String(
      data.photo ||
      data.photo_url ||
      data.photoUrl ||
      ""
    ).trim();

    const target = Number(
      data.target || 5
    );

    if (!name) {
      return json(
        {
          error: "Öğrenci adı gerekli."
        },
        400
      );
    }

    if (!className) {
      return json(
        {
          error: "Sınıf gerekli."
        },
        400
      );
    }

    const result = await env.ANDAC_DB
      .prepare(`
        INSERT INTO students
        (
          name,
          class_name,
          motto,
          photo,
          target
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        name,
        className,
        motto,
        photo,
        target
      )
      .run();

    return json({
      ok: true,
      id: result.meta.last_row_id
    });
  }

  /* ---------------------------------
     ADMIN - ÖĞRENCİ GÜNCELLE
  --------------------------------- */

  if (
    method === "PATCH" &&
    path.startsWith("/api/students/")
  ) {
    const id = Number(
      path.split("/").pop()
    );

    const data = await body(req);

    const name = String(
      data.name || ""
    ).trim();

    const className = String(
      data.class_name ||
      data.className ||
      ""
    ).trim();

    const motto = String(
      data.motto || ""
    ).trim();

    const photo = String(
      data.photo ||
      data.photo_url ||
      data.photoUrl ||
      ""
    ).trim();

    const target = Number(
      data.target || 5
    );

    if (!name || !className) {
      return json(
        {
          error: "Ad ve sınıf zorunlu."
        },
        400
      );
    }

    await env.ANDAC_DB
      .prepare(`
        UPDATE students
        SET
          name = ?,
          class_name = ?,
          motto = ?,
          photo = ?,
          target = ?
        WHERE id = ?
      `)
      .bind(
        name,
        className,
        motto,
        photo,
        target,
        id
      )
      .run();

    return json({
      ok: true
    });
  }

  /* ---------------------------------
     ADMIN - ÖĞRENCİ SİL
  --------------------------------- */

  if (
    method === "DELETE" &&
    path.startsWith("/api/students/")
  ) {
    const id = Number(
      path.split("/").pop()
    );

    /*
      Önce öğrencinin andaçlarını siliyoruz.
      Böylece foreign key problemi oluşmaz.
    */

    await env.ANDAC_DB
      .prepare(`
        DELETE FROM notes
        WHERE student_id = ?
      `)
      .bind(id)
      .run();

    await env.ANDAC_DB
      .prepare(`
        DELETE FROM students
        WHERE id = ?
      `)
      .bind(id)
      .run();

    return json({
      ok: true
    });
  }

  /* ---------------------------------
     ADMIN - CSV
  --------------------------------- */

  if (
    method === "GET" &&
    path === "/api/export.csv"
  ) {
    const rows = await getNotes(
      env,
      url,
      true
    );

    return new Response(
      makeCsv(rows),
      {
        headers: {
          "content-type":
            "text/csv; charset=utf-8",

          "content-disposition":
            'attachment; filename="andaclar.csv"'
        }
      }
    );
  }

  /* ---------------------------------
     ADMIN - EXCEL
  --------------------------------- */

  if (
    method === "GET" &&
    path === "/api/export.xls"
  ) {
    const rows = await getNotes(
      env,
      url,
      true
    );

    return new Response(
      makeExcel(rows),
      {
        headers: {
          "content-type":
            "application/vnd.ms-excel; charset=utf-8",

          "content-disposition":
            'attachment; filename="andaclar.xls"'
        }
      }
    );
  }

  /* ---------------------------------
     FRONTEND
  --------------------------------- */

  return env.ASSETS.fetch(req);
}

/* ---------------------------------
   WORKER
--------------------------------- */

export default {
  async fetch(req, env, ctx) {
    try {
      return await route(req, env);
    } catch (error) {
      console.error("WORKER ERROR:", error);

      return json(
        {
          error: "Sunucu hatası",
          detail: String(
            error?.message || error
          )
        },
        500
      );
    }
  }
};
