const MaterialRules = {
  // Chuẩn hóa số học: 20.0, 020 -> 20
  normalizeValue(val, kind) {
    if (!val) return "";
    if (kind === 'number') {
      const num = parseFloat(val);
      return isNaN(num) ? "" : num.toString();
    }
    return val.toString().trim();
  },

  // Tạo chữ ký (Identity Key) ổn định để so khớp trùng
  generateIdentityKey(categoryId, subtypeId, attributes, schema) {
    const subtypeSchema = schema.formSchemas[categoryId]?.find(s => s.id === subtypeId);
    if (!subtypeSchema) return "";

    const identityObj = { categoryId, subtypeId };
    subtypeSchema.fields.forEach(field => {
      if (field.identity) {
        identityObj[field.id] = this.normalizeValue(attributes[field.id], field.kind);
      }
    });
    
    // Sort keys cho chuỗi JSON ổn định
    return JSON.stringify(Object.keys(identityObj).sort().reduce((acc, key) => {
      acc[key] = identityObj[key];
      return acc;
    }, {}));
  },

  // Thuật toán sinh tên vật tư tự động
  generateName(categoryId, subtypeId, attributes, schema) {
    const subtypeSchema = schema.formSchemas[categoryId]?.find(s => s.id === subtypeId);
    if (!subtypeSchema) return "";
    
    const attr = (id) => this.normalizeValue(attributes[id], subtypeSchema.fields.find(f => f.id === id)?.kind);

    let name = subtypeSchema.label;

    if (categoryId === 'THEP') {
      if (subtypeId === 'STEEL_PLATE') {
        name += ` ${attr('grade')}`;
        if (attr('thickness') && attr('width') && attr('length')) {
          name += ` · ${attr('thickness')}x${attr('width')}x${attr('length')} mm`;
        }
      } else if (subtypeId === 'STEEL_ROUND') {
        name += ` ${attr('grade')} · Ø${attr('diameter')}x${attr('length')} mm`;
      }
    } else if (categoryId === 'CAO_SU') {
      name += ` ${attr('compound')} · ${attr('hardness')} Shore A`;
      if (attr('thickness')) name += ` · ${attr('thickness')}x${attr('width')}x${attr('length')} mm`;
    } else if (categoryId === 'TAM_TRUOT') {
      name += ` ${attr('compound')} · ${attr('thickness')}x${attr('width')}x${attr('length')} mm · ${attr('surface')}`;
    } else if (categoryId === 'BU_LONG') {
      name += ` ${attr('standard')} · ${attr('strength')} · M${attr('diameter')}x${attr('length')} · ${attr('finish')}`;
    }
    
    return name.replace(/\s+/g, ' ').trim();
  }
};
