const ADMIN_PIN = "2468";

const seedStudents = [
  {
    name: "Ayşe Yılmaz",
    class_name: "12-A",
    photo_url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500"
  },
  {
    name: "Mehmet Demir",
    class_name: "12-A",
    photo_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500"
  },
  {
    name: "Zeynep Kaya",
    class_name: "12-B",
    photo_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500"
  },
  {
    name: "Ali Çelik",
    class_name: "12-B",
    photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500"
  },
  {
    name: "Elif Şahin",
    class_name: "12-C",
    photo_url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500"
  },
  {
    name: "Burak Arslan",
    class_name: "12-C",
    photo_url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500"
  }
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function body(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function auth(req) {
  return req.headers.get("x-admin-pin") === ADMIN_PIN;
}

function csvEscape(value) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function csv(rows) {
  const headers = [
    "ID",
    "Öğrenci",
    "Sınıf",
    "Yazan",
    "Yakınlık",
    "Mesaj",
    "Durum",
    "Tarih"
  ];

  const lines = [
    headers.map(csvEscape).join(";")
  ];

  for (const row of rows) {
    lines.push([
      row.id,
      row.student_name,
      row.class_name,
      row.author_name,
      row.relationship,
      row.message,
      row.status,
      row.created_at
    ].map(csvEscape).join(";"));
  }

  return "\uFEFF" + lines.join("\r\n");
}

function xlsEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xls(rows) {
  const headers = [
    "ID",
    "Öğrenci",
    "Sınıf",
    "Yazan",
    "Yakınlık",
    "Mesaj",
    "Durum",
    "Tarih"
  ];

  let html = `
<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
 xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">

<Worksheet ss:Name="Andaçlar">
<Table>
`;

  html += "<Row>";

  for (const header of headers) {
    html += `<Cell><Data ss:Type="String">${xlsEscape(header)}</Data></Cell>`;
  }

  html += "</Row>";

  for (const row of rows) {
    html += "<Row>";

    const values = [
      row.id,
      row.student_name,
      row.class_name,
      row.author_name,
      row.relationship,
      row.message,
      row.status,
      row.created_at
    ];

    for (const value of values) {
      html += `<Cell><Data ss:Type="String">${xlsEscape(value)}</Data></Cell>`;
    }

    html += "</Row>";
  }

  html += `
</Table>
</Worksheet>
</Workbook>
`;

  return html;
}

async function ensureSeed(env) {
  const result = await env.ANDAC_DB
    .prepare("SELECT COUNT(*) AS count FROM students")
    .first();

  if (Number(result?.count || 0) > 0) {
    return;
  }

  for (const student of seedStudents) {
    await env.ANDAC_DB
      .prepare(`
        INSERT INTO students
        (name, class_name, photo_url)
        VALUES (?, ?, ?)
      `)
      .bind(
        student.name,
        student.class_name,
        student.photo_url
      )
      .run();
  }
}

async function getStudents(env) {
  const result = await env.ANDAC_DB
    .prepare(`
      SELECT
        id,
        name,
        class_name,
        photo_url,
        created_at
      FROM students
      ORDER BY class_name ASC, name ASC
    `)
    .all();

  return result.results || [];
}

async function getNotes(env, url, admin = false) {
  const studentId = url.searchParams.get("student");
  const status = url.searchParams.get("status");

  let sql = `
    SELECT
      n.id,
      n.student_id,
      s.name AS student_name,
      s.class_name,
      n.author_name,
      n.relationship,
      n.message,
      n.status,
      n.created_at,
      n.updated_at
    FROM notes n
    JOIN students s
      ON s.id = n.student_id
  `;

  const conditions = [];
  const params = [];

  /*
   * PUBLIC:
   * Sadece belirli öğrencinin approved andaçlarını göster.
   */
  if (!admin) {
    conditions.push("n.status = ?");
    params.push("approved");

    if (studentId) {
      conditions.push("n.student_id = ?");
      params.push(studentId);
    }
  }

  /*
   * ADMIN:
   * İsterse öğrenci ve durum filtreleyebilir.
   */
  if (admin) {
    if (studentId) {
      conditions.push("n.student_id = ?");
      params.push(studentId);
    }

    if (status) {
      conditions.push("n.status = ?");
      params.push(status);
    }
  }

  if (conditions.length) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY n.created_at DESC";

  const result = await env.ANDAC_DB
    .prepare(sql)
    .bind(...params)
    .all();

  return result.results || [];
}

async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  /*
   * HEALTH
   */
  if (method === "GET" && path === "/api/health") {
    return json({
      ok: true,
      app: "andac-defteri"
    });
  }

  /*
   * D1 tablolarının seed edilmesi
   */
  await ensureSeed(env);

  /*
   * PUBLIC STUDENTS
   */
  if (method === "GET" && path === "/api/students") {
    return json(await getStudents(env));
  }

  /*
   * PUBLIC APPROVED NOTES
   *
   * Örneğin:
   * /api/notes?student=1
   */
  if (method === "GET" && path === "/api/notes") {
    return json(await getNotes(env, url, false));
  }

  /*
   * NEW NOTE
   */
  if (method === "POST" && path === "/api/notes") {
    const data = await body(req);

    const studentId = Number(data.student_id);
    const authorName = String(data.author_name || "").trim();
    const relationship = String(data.relationship || "").trim();
    const message = String(data.message || "").trim();

    if (!studentId) {
      return json({
        error: "Öğrenci seçilmedi."
      }, 400);
    }

    if (!authorName) {
      return json({
        error: "Ad soyad gerekli."
      }, 400);
    }

    if (!relationship) {
      return json({
        error: "Yakınlık / ilişki bilgisi gerekli."
      }, 400);
    }

    if (message.length < 20) {
      return json({
        error: "Andaç yazısı en az 20 karakter olmalıdır."
      }, 400);
    }

    if (message.length > 600) {
      return json({
        error: "Andaç yazısı en fazla 600 karakter olabilir."
      }, 400);
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
      return json({
        error: "Öğrenci bulunamadı."
      }, 404);
    }

    const result = await env.ANDAC_DB
      .prepare(`
        INSERT INTO notes
        (
          student_id,
          author_name,
          relationship,
          message,
          status
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        studentId,
        authorName,
        relationship,
        message,
        "pending"
      )
      .run();

    return json({
      ok: true,
      id: result.meta?.last_row_id || null,
      message: "Andaçınız başarıyla gönderildi."
    });
  }

  /*
   * ADMIN LOGIN
   *
   * PIN: 2468
   */
  if (method === "POST" && path === "/api/admin/login") {
    const data = await body(req);

    const pin = String(data.pin || "").trim();

    if (pin === ADMIN_PIN) {
      return json({
        ok: true,
        message: "Giriş başarılı."
      });
    }

    return json({
      error: "PIN hatalı"
    }, 401);
  }

  /*
   * Bundan sonraki tüm /api admin işlemleri PIN ister.
   */
  if (path.startsWith("/api/") && !auth(req)) {
    return json({
      error: "Yetkisiz"
    }, 401);
  }

  /*
   * ADMIN - TÜM NOTLAR
   */
  if (method === "GET" && path === "/api/admin/notes") {
    return json(await getNotes(env, url, true));
  }

  /*
   * ADMIN - NOTLARI /api/notes üzerinden de getir
   */
  if (method === "GET" && path === "/api/admin/all-notes") {
    return json(await getNotes(env, url, true));
  }

  /*
   * ADMIN - NOTE UPDATE
   */
  if (
    method === "PATCH" &&
    path.startsWith("/api/notes/")
  ) {
    const id = Number(path.split("/").pop());

    if (!id) {
      return json({
        error: "Geçersiz andaç ID."
      }, 400);
    }

    const data = await body(req);

    const allowedFields = [
      "author_name",
      "relationship",
      "message",
      "status"
    ];

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (!updates.length) {
      return json({
        error: "Güncellenecek alan yok."
      }, 400);
    }

    if (
      data.message !== undefined &&
      String(data.message).length > 600
    ) {
      return json({
        error: "Andaç yazısı en fazla 600 karakter olabilir."
      }, 400);
    }

    if (
      data.status !== undefined &&
      !["pending", "approved", "rejected"].includes(data.status)
    ) {
      return json({
        error: "Geçersiz durum."
      }, 400);
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");

    values.push(id);

    const result = await env.ANDAC_DB
      .prepare(`
        UPDATE notes
        SET ${updates.join(", ")}
        WHERE id = ?
      `)
      .bind(...values)
      .run();

    if (!result.meta?.changes) {
      return json({
        error: "Andaç bulunamadı."
      }, 404);
    }

    return json({
      ok: true
    });
  }

  /*
   * ADMIN - NOTE DELETE
   */
  if (
    method === "DELETE" &&
    path.startsWith("/api/notes/")
  ) {
    const id = Number(path.split("/").pop());

    if (!id) {
      return json({
        error: "Geçersiz andaç ID."
      }, 400);
    }

    const result = await env.ANDAC_DB
      .prepare(`
        DELETE FROM notes
        WHERE id = ?
      `)
      .bind(id)
      .run();

    if (!result.meta?.changes) {
      return json({
        error: "Andaç bulunamadı."
      }, 404);
    }

    return json({
      ok: true
    });
  }

  /*
   * ADMIN - STUDENT ADD
   */
  if (
    method === "POST" &&
    path === "/api/students"
  ) {
    const data = await body(req);

    const name = String(data.name || "").trim();
    const className = String(
      data.class_name || data.className || ""
    ).trim();

    const photoUrl = String(
      data.photo_url || data.photoUrl || ""
    ).trim();

    if (!name) {
      return json({
        error: "Öğrenci adı gerekli."
      }, 400);
    }

    if (!className) {
      return json({
        error: "Sınıf gerekli."
      }, 400);
    }

    const result = await env.ANDAC_DB
      .prepare(`
        INSERT INTO students
        (
          name,
          class_name,
          photo_url
        )
        VALUES (?, ?, ?)
      `)
      .bind(
        name,
        className,
        photoUrl
      )
      .run();

    return json({
      ok: true,
      id: result.meta?.last_row_id || null
    });
  }

  /*
   * ADMIN - STUDENT DELETE
   */
  if (
    method === "DELETE" &&
    path.startsWith("/api/students/")
  ) {
    const id = Number(path.split("/").pop());

    if (!id) {
      return json({
        error: "Geçersiz öğrenci ID."
      }, 400);
    }

    await env.ANDAC_DB
      .prepare(`
        DELETE FROM notes
        WHERE student_id = ?
      `)
      .bind(id)
      .run();

    const result = await env.ANDAC_DB
      .prepare(`
        DELETE FROM students
        WHERE id = ?
      `)
      .bind(id)
      .run();

    if (!result.meta?.changes) {
      return json({
        error: "Öğrenci bulunamadı."
      }, 404);
    }

    return json({
      ok: true
    });
  }

  /*
   * ADMIN - CSV EXPORT
   */
  if (
    method === "GET" &&
    path === "/api/export.csv"
  ) {
    const rows = await getNotes(
      env,
      new URL(req.url),
      true
    );

    return new Response(csv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition":
          'attachment; filename="andaclar.csv"',
        "cache-control": "no-store"
      }
    });
  }

  /*
   * ADMIN - EXCEL EXPORT
   *
   * Excel SpreadsheetML formatı.
   */
  if (
    method === "GET" &&
    path === "/api/export.xls"
  ) {
    const rows = await getNotes(
      env,
      new URL(req.url),
      true
    );

    return new Response(xls(rows), {
      headers: {
        "content-type":
          "application/vnd.ms-excel; charset=utf-8",
        "content-disposition":
          'attachment; filename="andaclar.xls"',
        "cache-control": "no-store"
      }
    });
  }

  /*
   * Frontend
   */
  return env.ASSETS.fetch(req);
}

export default {
  async fetch(req, env, ctx) {
    try {
      return await route(req, env);
    } catch (error) {
      console.error("SERVER ERROR:", error);

      return json({
        error: "Sunucu hatası",
        detail: error?.message || String(error)
      }, 500);
    }
  }
};
