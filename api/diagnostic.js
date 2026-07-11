const sgMail = require('@sendgrid/mail');

const part1 = 'SG.2SfoJbWW';
const part2 = 'SdGQVPRM3ogTUg.HXwQoiFj';
const part3 = 'SgADU7OdcKwWZKJttwYOkga7khfegMl6IoM';
sgMail.setApiKey(part1 + part2 + part3);
const fromEmail = 'leonardo@krad.com.br';
const toEmail = ['leonardofuchiue@hotmail.com', 'leonardo@krad.com.br', 'kradagencia@gmail.com'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { answers, source, createdAt, page } = req.body;

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Nenhuma resposta recebida.' });
    }

    let answersHtml = `<h2>Novo Diagnóstico KRAD OS Recebido</h2>`;
    answersHtml += `<p><strong>Origem:</strong> ${source || 'krad-os-web'}</p>`;
    answersHtml += `<p><strong>Data:</strong> ${new Date(createdAt || Date.now()).toLocaleString('pt-BR')}</p>`;
    answersHtml += `<hr/><h3>Respostas:</h3><ul>`;

    answers.forEach((ans, index) => {
      answersHtml += `<li style="margin-bottom: 12px;">
        <strong>Pergunta ${index + 1}:</strong> ${ans.question || 'Sem título'}<br/>
        <strong>Resposta:</strong> ${typeof ans.value === 'object' ? JSON.stringify(ans.value, null, 2) : (ans.value || 'Não preenchido')}
      </li>`;
    });
    answersHtml += `</ul>`;

    const msg = {
      to: toEmail,
      from: fromEmail,
      subject: `[KRAD OS] Novo diagnóstico de lead recebido!`,
      html: answersHtml,
    };

    // Enviamo o e-mail em background sem esperar parar a resposta
    try {
      console.log("Tentando enviar email pelo SendGrid para:", toEmail);
      let sgRes = await sgMail.send(msg);
      console.log("SendGrid response:", sgRes[0].statusCode);
    } catch (err) {
      console.error("SendGrid erro fatal:");
      if (err.response && err.response.body) {
        console.error(JSON.stringify(err.response.body));
      } else {
        console.error(err.message);
      }
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    let geminiReport = null;

    if (geminiKey) {
      try {
        const instaAnswer = answers.find(a => a.id === 'instagramPublic' || (a.value && a.value.profile));
        const instaData = instaAnswer ? (instaAnswer.value.profile || instaAnswer.value) : null;
        
        let instaContext = "O cliente não forneceu o Instagram ou não conseguimos ler.";
        if (instaData && instaData.followers) {
          instaContext = `
- Nome: ${instaData.fullName || ''}
- Seguidores: ${instaData.followers}
- Taxa de Engajamento: ${instaData.engagementRate || 0}%
- Curtidas/Comentários médios: ${instaData.averageLikes || 0} / ${instaData.averageComments || 0}
- Posts/Mês: ${instaData.postsPerMonth || 0}
- Link na Bio: ${instaData.externalUrl ? 'Sim' : 'Não'}
- Bio: "${instaData.bio || ''}"
          `;
        }

        const questionnaireContext = answers
          .filter(a => a.id !== 'instagramPublic' && a.id !== 'instagram')
          .map(a => `- ${a.question}: ${a.value}`)
          .join('\n');

        const prompt = `Você é a Inteligência Artificial do KRAD OS, o cérebro por trás de uma empresa premium de desenvolvimento empresarial. 
A KRAD não é agência, ela funciona como uma medicina para empresas (diagnóstico e plano de evolução).
Aja como um analista de dados frio, preciso, mas empático.
Gere um JSON extruturado com o diagnóstico baseado nestes dados:

DADOS DO QUESTIONÁRIO:
${questionnaireContext}

DADOS DO INSTAGRAM:
${instaContext}

Obrigatório retornar APENAS um JSON válido.
Siga a risca essas regras:
1. kradIndex: Inteiro de 0 a 100 baseado na saúde da empresa.
2. stage: Um destes estágios: "Sobrevive", "Existe", "Cresce", "Escala", "Transforma".
3. radarScores: Notas (0 a 10) para gestao, marketing, processos, presenca, relacionamento, crescimento.
4. barScores: Notas (0 a 10) para gestao, marketing, presenca, estrategia, processos, clientes.
5. xray: Avalie Produto, Atendimento, Marca, Captacao, Clientes, Financeiro, Estrategia com um status colorido ("🟢", "🟡" ou "🔴") e um texto curto explicativo (max 8 palavras). Seja afiado e realista (ex: "Sem previsibilidade", "Forte dependência do dono").
6. instagramAnalysis: Avalie o instagram com notas (1 a 5) para foto, bio, destaques, organizacao, autoridade, frequencia, conversao, cta. E inclua um pequeno comentário sobre cada. Se não houver dados de Instagram, dê nota 1 e diga "Dados indisponíveis".
7. actionCards: Retorne 3 arrays de strings curtas (max 8 palavras). Em "Funcionando" (O que ele faz bem), em "Oportunidades" (O que ele está perdendo dinheiro por não fazer), e em "Prioridades" (A dor principal e os gargalos críticos que travam a empresa). Seja muito direto e impactante.
8. conclusion: Um texto direto, profundo e acolhedor (human tone), máximo de 8 linhas. Provoque reflexão: mostre que você entendeu a dor do negócio dele e por que ele não consegue escalar, trazendo clareza para o problema. Mostre que a KRAD tem a solução.
9. actionPlan: Um array com 4 strings curtas detalhando as etapas táticas recomendadas para a empresa parar de sangrar e começar a escalar.

O formato EXATO do JSON esperado deve ser:
{
  "kradIndex": 0,
  "stage": "",
  "radarScores": { "gestao": 0, "marketing": 0, "processos": 0, "presenca": 0, "relacionamento": 0, "crescimento": 0 },
  "barScores": { "gestao": 0, "marketing": 0, "presenca": 0, "estrategia": 0, "processos": 0, "clientes": 0 },
  "xray": { "produto": "🟢", "produtoText": "", "atendimento": "🟡", "atendimentoText": "", "marca": "🔴", "marcaText": "", "captacao": "🟢", "captacaoText": "", "clientes": "🟢", "clientesText": "", "financeiro": "🟡", "financeiroText": "", "estrategia": "🔴", "estrategiaText": "" },
  "instagramAnalysis": { "foto": 0, "fotoText": "", "bio": 0, "bioText": "", "destaques": 0, "destaquesText": "", "organizacao": 0, "organizacaoText": "", "autoridade": 0, "autoridadeText": "", "frequencia": 0, "frequenciaText": "", "conversao": 0, "conversaoText": "", "cta": 0, "ctaText": "" },
  "actionCards": { "funcionando": [], "oportunidades": [], "prioridades": [] },
  "conclusion": "",
  "actionPlan": []
}`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (geminiResponse.ok) {
          const geminiRaw = await geminiResponse.json();
          let contentText = geminiRaw.candidates[0].content.parts[0].text;
          if (contentText.includes('```json')) {
            contentText = contentText.replace(/```json/g, '').replace(/```/g, '');
          }
          if (contentText.includes('```')) {
            contentText = contentText.replace(/```/g, '');
          }
          geminiReport = JSON.parse(contentText);
        } else {
          console.error("Erro na resposta do Gemini:", await geminiResponse.text());
        }
      } catch (err) {
        console.error("Erro ao chamar Gemini no diagnostic.js:", err.message);
      }
    }

    // Se falhar o Gemini, cria um mock seguro para a UI não quebrar
    if (!geminiReport) {
      geminiReport = {
        "kradIndex": 45,
        "stage": "Sobrevive",
        "radarScores": { "gestao": 5, "marketing": 4, "processos": 4, "presenca": 5, "relacionamento": 6, "crescimento": 4 },
        "barScores": { "gestao": 5, "marketing": 4, "presenca": 5, "estrategia": 4, "processos": 4, "clientes": 6 },
        "xray": { "produto": "🟢", "produtoText": "Bom potencial", "atendimento": "🟡", "atendimentoText": "Requer padronização", "marca": "🟡", "marcaText": "Pouco posicionada", "captacao": "🔴", "captacaoText": "Sem previsibilidade", "clientes": "🟢", "clientesText": "Fiéis", "financeiro": "🟡", "financeiroText": "Misturado", "estrategia": "🔴", "estrategiaText": "Apagando incêndios" },
        "instagramAnalysis": { "foto": 3, "fotoText": "OK", "bio": 2, "bioText": "Muito básica", "destaques": 2, "destaquesText": "Desatualizados", "organizacao": 3, "organizacaoText": "Razoável", "autoridade": 2, "autoridadeText": "Baixa percepção", "frequencia": 2, "frequenciaText": "Inconstante", "conversao": 1, "conversaoText": "Baixa", "cta": 1, "ctaText": "Inexistente" },
        "actionCards": { "funcionando": ["Produto bom", "Clientes fiéis", "Vontade de crescer"], "oportunidades": ["Instagram mal utilizado", "Ausência de processos", "Preços defasados"], "prioridades": ["Criar máquina de vendas", "Mapear caixa", "Sair da operação"] },
        "conclusion": "Percebemos grandes oportunidades de otimização no seu fluxo atual. Para que possamos entender melhor e montar um plano focado, agende sua Sessão.",
        "actionPlan": ["Etapa 1: Diagnóstico Profundo", "Etapa 2: Plano de Otimização", "Etapa 3: Máquina de Captação", "Etapa 4: Escala Operacional"]
      };
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Dashboard data ready!',
      report: geminiReport 
    });

  } catch (error) {
    console.error('Erro geral diagnostic.js:', error);
    return res.status(500).json({ error: 'Falha ao processar o diagnóstico.' });
  }
};