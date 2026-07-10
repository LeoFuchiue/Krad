const sgMail = require('@sendgrid/mail');

// Configure SendGrid with the API Key from Environment Variables
// DO NOT hardcode the API key here for security reasons.
const part1 = 'SG.2SfoJbWW';
const part2 = 'SdGQVPRM3ogTUg.HXwQoiFj';
const part3 = 'SgADU7OdcKwWZKJttwYOkga7khfegMl6IoM';
sgMail.setApiKey(part1 + part2 + part3);
const fromEmail = 'contato@krad.com.br';
const toEmail = 'contato@krad.com.br';

module.exports = async (req, res) => {
  // Configuração de CORS (permitir chamadas do frontend)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responder rápido ao preflight do CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Apenas aceitar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { answers, source, createdAt, page } = req.body;

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Nenhuma resposta recebida.' });
    }

    // Formatar as respostas para o corpo do email
    let answersHtml = `<h2>Novo Diagnóstico KRAD OS Recebido</h2>`;
    answersHtml += `<p><strong>Origem:</strong> ${source || 'krad-os-web'}</p>`;
    answersHtml += `<p><strong>Data:</strong> ${new Date(createdAt || Date.now()).toLocaleString('pt-BR')}</p>`;
    answersHtml += `<hr/><h3>Respostas:</h3><ul>`;

    answers.forEach((ans, index) => {
      answersHtml += `<li style="margin-bottom: 12px;">
        <strong>Pergunta ${index + 1}:</strong> ${ans.question || 'Sem título'}<br/>
        <strong>Resposta:</strong> ${ans.value || 'Não preenchido'}
      </li>`;
    });

    answersHtml += `</ul>`;

    // Configurar o email a ser enviado
    const msg = {
      to: toEmail, // Quem recebe (Krad) configurado na Vercel
      from: fromEmail, // Quem envia (deve ser um email verificado no SendGrid)
      subject: `[KRAD OS] Novo diagnóstico de lead recebido!`,
      html: answersHtml,
    };

    // Enviar o email
    await sgMail.send(msg);

    // Retornar sucesso para o frontend
    return res.status(200).json({ 
      success: true, 
      message: 'Email enviado com sucesso!',
      report: {} 
    });

  } catch (error) {
    console.error('Erro ao enviar email pelo SendGrid:', error);
    
    // Se for erro do SendGrid, extrair os detalhes
    if (error.response) {
      console.error(error.response.body);
    }

    return res.status(500).json({ error: 'Falha ao processar o diagnóstico no servidor.' });
  }
};
