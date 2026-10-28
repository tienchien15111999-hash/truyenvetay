// Vbee Batch bắt buộc có webhookUrl. Trang web vẫn tự hỏi kết quả qua GET /api/vbee?id=...,
// nên chỗ này chỉ cần nhận thông báo của Vbee và trả 200 là đủ.
module.exports = (req, res) => {
  res.status(200).json({ ok: true });
};
