// ============================================================================
// CONFIGURAÇÃO SEGURA DO SUPABASE
// ============================================================================

const SUPABASE_URL = 'https://kpvearnxbnrazhkiyqeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_LGW8XoafLGgLQxnRYiXRdg_a3chpGZW';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ESTADO GLOBAL
let usuarioLogado = null;
let perfilUsuario = null;
let listaAmbientes = [];
let listaReservas = [];
let mapaOcupacoesInspetor = {};

// INICIALIZAÇÃO DA APLICAÇÃO
document.addEventListener("DOMContentLoaded", async () => {
  const hoje = new Date().toISOString().split("T")[0];

  const filtroDataReserva = document.getElementById("filtro-data-reserva");
  if (filtroDataReserva) filtroDataReserva.value = "";

  const inspData = document.getElementById("insp-data");
  if (inspData) inspData.value = hoje;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    usuarioLogado = session.user;
    await carregarPerfilEIniciar();
  } else {
    exibirTelaAuth();
  }

  // Ativa a escuta em tempo real do Supabase
  configurarRealtime();
});

// ESCUTA EM TEMPO REAL (SINCRONIZAÇÃO AUTOMÁTICA ENTRE TELAS)
function configurarRealtime() {
  supabaseClient
    .channel("mudancas-sistema")
    .on("postgres_changes", { event: "*", schema: "public", table: "ambientes" }, async () => {
      await carregarAmbientes();
      carregarTabelaAmbientes();
      carregarPainelInspetor();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "ocupacoes_ambientes" }, () => {
      carregarPainelInspetor();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "reservas" }, () => {
      carregarReservas();
      carregarSolicitacoesPendentes();
      carregarPainelInspetor();
    })
    .subscribe();
}

// ALTERNA TELA DE AUTH
function toggleAuth(modo) {
  const formLogin = document.getElementById("form-login");
  const formCadastro = document.getElementById("form-cadastro");
  if (modo === "cadastro") {
    formLogin.classList.add("hidden");
    formCadastro.classList.remove("hidden");
  } else {
    formCadastro.classList.add("hidden");
    formLogin.classList.remove("hidden");
  }
}

// CADASTRO DE FUNCIONÁRIO
async function handleCadastro(e) {
  e.preventDefault();
  const nome = document.getElementById("cad-nome").value.trim();
  const email = document.getElementById("cad-email").value.trim();
  const matricula = document.getElementById("cad-matricula").value.trim();
  const segmento = document.getElementById("cad-segmento").value;
  const cargo = document.getElementById("cad-cargo").value;
  const senha = document.getElementById("cad-senha").value;

  const { data, error } = await supabaseClient.auth.signUp({ 
    email, 
    password: senha,
    options: {
      data: { nome, matricula, segmento, cargo }
    }
  });

  if (error) {
    alert("Erro no cadastro: " + error.message);
    return;
  }

  if (data.user) {
    const { error: perfilError } = await supabaseClient.from("perfis").insert([
      { id: data.user.id, nome, email, matricula, segmento, cargo }
    ]);

    if (perfilError) {
      console.error("Erro ao salvar tabela perfis:", perfilError);
    }

    alert(`Funcionário cadastrado com sucesso! Faça login para continuar.`);
    toggleAuth("login");
  }
}

// LOGIN DE FUNCIONÁRIO
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;

  try {
    await supabaseClient.auth.signOut();

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });

    if (error) {
      alert("Erro ao acessar: " + error.message);
      return;
    }

    usuarioLogado = data.user;
    await carregarPerfilEIniciar();
  } catch (err) {
    console.error("Erro no login:", err);
    alert("Erro inesperado ao realizar login.");
  }
}

// CARREGA PERFIL E AJUSTA INTERFACE DE ACORDO COM O CARGO
async function carregarPerfilEIniciar() {
  const { data, error } = await supabaseClient
    .from("perfis")
    .select("*")
    .eq("id", usuarioLogado.id)
    .maybeSingle();

  if (data) {
    perfilUsuario = data;
  } else {
    const meta = usuarioLogado.user_metadata || {};
    perfilUsuario = {
      nome: meta.nome || usuarioLogado.email,
      cargo: meta.cargo || "Instrutor",
      segmento: meta.segmento || "Geral"
    };
  }

  document.getElementById("auth-container").classList.add("hidden");
  document.getElementById("app-container").classList.remove("hidden");

  document.getElementById("user-display").innerText = `Olá, ${perfilUsuario.nome}`;
  const badge = document.getElementById("badge-perfil");
  badge.innerText = perfilUsuario.cargo;

  // Reset de abas
  document.getElementById("btn-tab-inspetor")?.classList.add("hidden");
  document.getElementById("btn-tab-solicitar")?.classList.add("hidden");
  document.getElementById("btn-tab-validar")?.classList.add("hidden");
  document.getElementById("btn-tab-ambientes")?.classList.add("hidden");
  document.getElementById("btn-tab-funcionarios")?.classList.add("hidden");

  const cargo = perfilUsuario.cargo;
  const eTecnicoOuCoord = (cargo === "Tecnico de Educacao" || cargo === "Técnico de Educação" || cargo === "Coordenador");
  const eInspetor = (cargo === "Inspetor" || cargo === "Inspetor de Alunos");

  if (eInspetor || eTecnicoOuCoord) {
    document.getElementById("btn-tab-inspetor")?.classList.remove("hidden");
  }

  if (cargo === "Instrutor" || eTecnicoOuCoord) {
    document.getElementById("btn-tab-solicitar")?.classList.remove("hidden");
  }

  if (eTecnicoOuCoord) {
    document.getElementById("btn-tab-validar")?.classList.remove("hidden");
    document.getElementById("btn-tab-ambientes")?.classList.remove("hidden");
    document.getElementById("btn-tab-funcionarios")?.classList.remove("hidden");
  }

  await carregarAmbientes();

  if (eInspetor) {
    trocarAba("inspetor");
  } else {
    await carregarReservas();
  }
}

// LOGOUT
async function handleLogout() {
  await supabaseClient.auth.signOut();
  localStorage.clear();
  sessionStorage.clear();
  window.location.reload();
}

function exibirTelaAuth() {
  document.getElementById("auth-container").classList.remove("hidden");
  document.getElementById("app-container").classList.add("hidden");
}

// ALTERNÂNCIA DE ABAS
function trocarAba(aba) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".nav-btn").forEach(el => el.classList.remove("active"));

  if (window.event && window.event.target) window.event.target.classList.add("active");

  if (aba === "inspetor") {
    document.getElementById("aba-inspetor").classList.remove("hidden");
    carregarPainelInspetor();
  } else if (aba === "reservas") {
    document.getElementById("aba-reservas").classList.remove("hidden");
    carregarReservas();
  } else if (aba === "solicitar") {
    document.getElementById("aba-solicitar").classList.remove("hidden");
  } else if (aba === "validar") {
    document.getElementById("aba-validar").classList.remove("hidden");
    carregarSolicitacoesPendentes();
  } else if (aba === "ambientes") {
    document.getElementById("aba-ambientes").classList.remove("hidden");
    carregarTabelaAmbientes();
  } else if (aba === "funcionarios") {
    document.getElementById("aba-funcionarios").classList.remove("hidden");
    carregarTabelaFuncionarios();
  }
}

/* =========================================================
   PAINEL DO INSPETOR (GRADE DE AMBIENTES ORGANIZADA POR SEGMENTOS)
   ========================================================= */
async function carregarPainelInspetor() {
  const container = document.getElementById("grid-ambientes-inspetor");
  if (!container) return;

  const dataFiltro = document.getElementById("insp-data").value;
  const turnoFiltro = document.getElementById("insp-turno").value;

  if (!dataFiltro) return;

  container.innerHTML = '<p class="text-center">Atualizando grade de ambientes...</p>';

  // 1. Busca todos os ambientes cadastrados
  const { data: ambientes, error: errAmb } = await supabaseClient.from("ambientes").select("*");
  if (errAmb || !ambientes) {
    container.innerHTML = '<p class="text-center">Erro ao carregar lista de ambientes.</p>';
    return;
  }

  // 2. Busca reservas aprovadas para a data e turno selecionados
  const { data: reservas } = await supabaseClient
    .from("reservas")
    .select("*")
    .eq("status", "Aprovada")
    .lte("data_inicio", dataFiltro)
    .gte("data_fim", dataFiltro)
    .eq("turno", turnoFiltro);

  // 3. Busca marcações manuais dos inspetores para a data e turno
  const { data: ocupacoes } = await supabaseClient
    .from("ocupacoes_ambientes")
    .select("*")
    .eq("data", dataFiltro)
    .eq("turno", turnoFiltro);

  mapaOcupacoesInspetor = {};
  if (ocupacoes) {
    ocupacoes.forEach(o => { mapaOcupacoesInspetor[o.ambiente_id] = o; });
  }

  container.innerHTML = "";

  // 4. SEPARAÇÃO E ORDENAÇÃO DOS AMBIENTES
  const salasDeAula = [];
  const porSegmento = {};

  ambientes.forEach(amb => {
    const eSala = amb.tipo === "Sala de Aula" || amb.nome.toLowerCase().includes("sala");
    if (eSala) {
      salasDeAula.push(amb);
    } else {
      const seg = amb.segmento || "Diversos";
      if (!porSegmento[seg]) porSegmento[seg] = [];
      porSegmento[seg].push(amb);
    }
  });

  // Ordena as Salas de Aula numericamente (ex: Sala 1, Sala 2 ... Sala 15)
  salasDeAula.sort((a, b) => {
    const numA = parseInt((a.nome.match(/\d+/) || [999])[0], 10);
    const numB = parseInt((b.nome.match(/\d+/) || [999])[0], 10);
    if (numA !== numB) return numA - numB;
    return a.nome.localeCompare(b.nome);
  });

  // Função interna para renderizar o bloco de cada segmento
  const renderizarBlocoSegmento = (titulo, lista) => {
    if (!lista || lista.length === 0) return;

    const bloco = document.createElement("div");
    bloco.className = "segmento-bloco";

    const header = document.createElement("div");
    header.className = "segmento-titulo";
    header.innerText = titulo;
    bloco.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "grid-ambientes";

    lista.forEach(amb => {
      let responsavel = null;
      let observacao = "";
      let isOcupado = false;

      if (mapaOcupacoesInspetor[amb.id]) {
        responsavel = mapaOcupacoesInspetor[amb.id].responsavel_nome;
        observacao = mapaOcupacoesInspetor[amb.id].observacao || "";
        isOcupado = true;
      } else if (reservas) {
        const res = reservas.find(r => r.ambiente_id === amb.id);
        if (res) {
          responsavel = `Instrutor ${res.nome_instrutor}`;
          isOcupado = true;
        }
      }

      const card = document.createElement("div");
      card.className = `card-ambiente-box ${isOcupado ? 'ocupado' : 'livre'}`;
      card.onclick = () => abrirModalOcupacao(amb.id, amb.nome, responsavel, observacao);

      card.innerHTML = `
        <div class="card-ambiente-nome">${amb.nome}</div>
        <div class="card-ambiente-user">
          ${isOcupado ? `👤 ${responsavel}` : 'DISPONÍVEL'}
        </div>
      `;

      grid.appendChild(card);
    });

    bloco.appendChild(grid);
    container.appendChild(bloco);
  };

  // 1º Renderiza o bloco de SALAS DE AULA
  renderizarBlocoSegmento("🏫 SALAS DE AULA", salasDeAula);

  // 2º Renderiza os demais SEGMENTOS em Ordem Alfabética
  const segmentosOrdenados = Object.keys(porSegmento).sort((a, b) => a.localeCompare(b));

  segmentosOrdenados.forEach(seg => {
    // Ordena os ambientes em ordem alfabética dentro do próprio segmento
    porSegmento[seg].sort((a, b) => a.nome.localeCompare(b.nome));
    renderizarBlocoSegmento(`🔬 SEGMENTO: ${seg.toUpperCase()}`, porSegmento[seg]);
  });
}

function abrirModalOcupacao(ambienteId, ambienteNome, responsavelAtual, obsAtual) {
  document.getElementById("modal-ambiente-id").value = ambienteId;
  document.getElementById("modal-titulo-ambiente").innerText = `Ambiente: ${ambienteNome}`;
  document.getElementById("modal-responsavel").value = responsavelAtual ? responsavelAtual.replace("Instrutor ", "") : "";
  document.getElementById("modal-observacao").value = obsAtual || "";
  document.getElementById("modal-ocupacao").classList.remove("hidden");
}

function fecharModalOcupacao() {
  document.getElementById("modal-ocupacao").classList.add("hidden");
  document.getElementById("form-modal-ocupacao").reset();
}

async function salvarOcupacaoInspetor(e) {
  e.preventDefault();
  const ambienteId = document.getElementById("modal-ambiente-id").value;
  const responsavel = document.getElementById("modal-responsavel").value.trim();
  const obs = document.getElementById("modal-observacao").value.trim();
  const dataFiltro = document.getElementById("insp-data").value;
  const turnoFiltro = document.getElementById("insp-turno").value;

  const payload = {
    ambiente_id: ambienteId,
    data: dataFiltro,
    turno: turnoFiltro,
    responsavel_nome: `Instrutor ${responsavel}`,
    observacao: obs,
    registrado_por: perfilUsuario ? perfilUsuario.nome : "Inspetor"
  };

  const { error } = await supabaseClient.from("ocupacoes_ambientes").upsert(payload, {
    onConflict: "ambiente_id,data,turno"
  });

  if (error) {
    alert("Erro ao salvar ocupação: " + error.message);
  } else {
    fecharModalOcupacao();
    await carregarPainelInspetor();
  }
}

async function liberarAmbienteOcupado() {
  const ambienteId = document.getElementById("modal-ambiente-id").value;
  const dataFiltro = document.getElementById("insp-data").value;
  const turnoFiltro = document.getElementById("insp-turno").value;

  if (confirm("Deseja liberar este ambiente e remover o registro?")) {
    await supabaseClient
      .from("ocupacoes_ambientes")
      .delete()
      .eq("ambiente_id", ambienteId)
      .eq("data", dataFiltro)
      .eq("turno", turnoFiltro);

    fecharModalOcupacao();
    await carregarPainelInspetor();
  }
}

/* =========================================================
   MÓDULO DE AMBIENTES (LISTAGEM E SELEÇÃO)
   ========================================================= */
async function carregarAmbientes() {
  const { data, error } = await supabaseClient.from("ambientes").select("*").order("nome");
  if (error) return;

  listaAmbientes = data || [];
  
  const selectAmb = document.getElementById("res-ambiente");
  if (selectAmb) {
    selectAmb.innerHTML = '<option value="">Selecione um ambiente...</option>';
    listaAmbientes.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.innerText = `${a.nome} (${a.segmento} - Cap: ${a.capacidade} lugares)`;
      selectAmb.appendChild(opt);
    });
  }
}

/* =========================================================
   CRUD DE AMBIENTES
   ========================================================= */
function carregarTabelaAmbientes() {
  const tabelaCorpo = document.getElementById("tabela-ambientes-corpo");
  if (!tabelaCorpo) return;

  tabelaCorpo.innerHTML = "";

  listaAmbientes.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${a.nome}</strong></td>
      <td>${a.tipo}</td>
      <td>${a.segmento}</td>
      <td>${a.capacidade} lugares</td>
      <td class="text-center">
        <button class="btn btn-sm btn-edit" onclick="prepararEdicaoAmbiente('${a.id}')">✏️ Editar</button>
        <button class="btn btn-sm btn-danger" onclick="excluirAmbiente('${a.id}')">🗑️ Excluir</button>
      </td>
    `;
    tabelaCorpo.appendChild(tr);
  });
}

async function salvarAmbiente(e) {
  e.preventDefault();
  const id = document.getElementById("amb-id").value;
  const nome = document.getElementById("amb-nome").value.trim();
  const tipo = document.getElementById("amb-tipo").value;
  const segmento = document.getElementById("amb-segmento").value;
  const capacidade = parseInt(document.getElementById("amb-capacidade").value);

  if (id) {
    await supabaseClient.from("ambientes").update({ nome, tipo, segmento, capacidade }).eq("id", id);
  } else {
    await supabaseClient.from("ambientes").insert([{ nome, tipo, segmento, capacidade }]);
  }

  limparFormAmbiente();
  await carregarAmbientes();
  carregarTabelaAmbientes();
  await carregarPainelInspetor();
}

function prepararEdicaoAmbiente(id) {
  const a = listaAmbientes.find(item => item.id === id);
  if (!a) return;

  document.getElementById("amb-id").value = a.id;
  document.getElementById("amb-nome").value = a.nome;
  document.getElementById("amb-tipo").value = a.tipo;
  document.getElementById("amb-segmento").value = a.segmento;
  document.getElementById("amb-capacidade").value = a.capacidade;

  document.getElementById("titulo-form-ambiente").innerText = "✏️ Editar Ambiente";
  document.getElementById("btn-cancelar-ambiente").classList.remove("hidden");
}

function limparFormAmbiente() {
  document.getElementById("form-ambiente").reset();
  document.getElementById("amb-id").value = "";
  document.getElementById("titulo-form-ambiente").innerText = "🏫 Cadastrar / Editar Ambiente";
  document.getElementById("btn-cancelar-ambiente").classList.add("hidden");
}

async function excluirAmbiente(id) {
  if (confirm("Tem certeza que deseja excluir este ambiente?")) {
    await supabaseClient.from("ambientes").delete().eq("id", id);
    await carregarAmbientes();
    carregarTabelaAmbientes();
    await carregarPainelInspetor();
  }
}

/* =========================================================
   MÓDULO DE RESERVAS
   ========================================================= */
async function carregarReservas() {
  const segmentoEl = document.getElementById("filtro-segmento");
  const dataFiltroEl = document.getElementById("filtro-data-reserva");

  const segmento = segmentoEl ? segmentoEl.value : "todos";
  const dataFiltro = dataFiltroEl ? dataFiltroEl.value : "";

  let query = supabaseClient.from("reservas").select("*");

  if (segmento && segmento !== "todos") {
    query = query.or(`segmento_ambiente.eq.${segmento},segmento_instrutor.eq.${segmento}`);
  }

  if (dataFiltro) {
    query = query.lte("data_inicio", dataFiltro).gte("data_fim", dataFiltro);
  }

  const { data, error } = await query.order("criado_em", { ascending: false });
  const tabelaCorpo = document.getElementById("tabela-reservas-corpo");
  if (!tabelaCorpo) return;

  tabelaCorpo.innerHTML = "";

  if (error || !data || data.length === 0) {
    tabelaCorpo.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma reserva encontrada para os filtros selecionados.</td></tr>';
    return;
  }

  data.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${r.codigo_reserva}</strong></td>
      <td>${r.nome_ambiente} <br><small class="hint">${r.segmento_ambiente}</small></td>
      <td>${formatarData(r.data_inicio)} até ${formatarData(r.data_fim)}</td>
      <td>${r.turno} <br><small class="hint">${r.horario}</small></td>
      <td>${r.nome_instrutor} <br><small class="hint">${r.segmento_instrutor}</small></td>
      <td><span class="badge-status ${r.status}">${r.status}</span></td>
    `;
    tabelaCorpo.appendChild(tr);
  });
}

// SOLICITAR RESERVA
async function solicitarReserva(e) {
  e.preventDefault();
  const ambienteId = document.getElementById("res-ambiente").value;
  const turno = document.getElementById("res-turno").value;
  const dataInicio = document.getElementById("res-data-inicio").value;
  const dataFim = document.getElementById("res-data-fim").value;
  const horario = document.getElementById("res-horario").value.trim();
  const obs = document.getElementById("res-obs").value.trim();

  const ambienteObj = listaAmbientes.find(a => a.id === ambienteId);
  if (!ambienteObj) {
    alert("Selecione um ambiente válido!");
    return;
  }

  const btn = document.getElementById("btn-enviar-reserva");
  btn.disabled = true;
  btn.innerText = "Enviando...";

  const codigo = `RES-${Math.floor(1000 + Math.random() * 9000)}`;

  const novaReserva = {
    codigo_reserva: codigo,
    data_inicio: dataInicio,
    data_fim: dataFim,
    turno: turno,
    horario: horario,
    instrutor_id: usuarioLogado.id,
    nome_instrutor: perfilUsuario.nome,
    segmento_instrutor: perfilUsuario.segmento,
    ambiente_id: ambienteObj.id,
    nome_ambiente: ambienteObj.nome,
    segmento_ambiente: ambienteObj.segmento,
    status: (perfilUsuario.cargo === "Tecnico de Educacao" || perfilUsuario.cargo === "Coordenador") ? "Aprovada" : "Pendente",
    observacoes: obs
  };

  const { error } = await supabaseClient.from("reservas").insert([novaReserva]);

  btn.disabled = false;
  btn.innerText = "Enviar Solicitação";

  if (error) {
    alert("Erro ao solicitar reserva: " + error.message);
  } else {
    alert(`Solicitação realizada com sucesso! Código: ${codigo}`);
    document.getElementById("form-solicitar-reserva").reset();
    trocarAba("reservas");
  }
}

// CARREGAR SOLICITAÇÕES PENDENTES
async function carregarSolicitacoesPendentes() {
  const { data, error } = await supabaseClient
    .from("reservas")
    .select("*")
    .order("criado_em", { ascending: false });

  const tabelaCorpo = document.getElementById("tabela-validacao-corpo");
  if (!tabelaCorpo) return;

  tabelaCorpo.innerHTML = "";

  if (error || !data || data.length === 0) {
    tabelaCorpo.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma solicitação encontrada.</td></tr>';
    return;
  }

  data.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${r.codigo_reserva}</strong></td>
      <td>${r.nome_instrutor} (${r.segmento_instrutor})</td>
      <td>${r.nome_ambiente}</td>
      <td>${formatarData(r.data_inicio)} - ${r.turno}</td>
      <td><span class="badge-status ${r.status}">${r.status}</span></td>
      <td class="text-center">
        <button class="btn btn-sm btn-success" onclick="alterarStatusReserva('${r.id}', 'Aprovada')">✔️ Aprovar</button>
        <button class="btn btn-sm btn-danger" onclick="alterarStatusReserva('${r.id}', 'Recusada')">❌ Recusar</button>
      </td>
    `;
    tabelaCorpo.appendChild(tr);
  });
}

async function alterarStatusReserva(id, novoStatus) {
  const { error } = await supabaseClient
    .from("reservas")
    .update({ status: novoStatus })
    .eq("id", id);

  if (error) {
    alert("Erro ao atualizar status: " + error.message);
  } else {
    carregarSolicitacoesPendentes();
  }
}

/* =========================================================
   CRUD DE FUNCIONÁRIOS
   ========================================================= */
async function carregarTabelaFuncionarios() {
  const { data, error } = await supabaseClient.from("perfis").select("*").order("nome");
  const tabelaCorpo = document.getElementById("tabela-funcionarios-corpo");
  if (!tabelaCorpo) return;

  tabelaCorpo.innerHTML = "";

  if (error || !data) return;

  data.forEach(f => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${f.nome}</strong></td>
      <td>${f.email}</td>
      <td>${f.matricula}</td>
      <td>${f.segmento}</td>
      <td><span class="badge">${f.cargo}</span></td>
      <td class="text-center">
        <button class="btn btn-sm btn-danger" onclick="excluirFuncionario('${f.id}')">🗑️ Excluir</button>
      </td>
    `;
    tabelaCorpo.appendChild(tr);
  });
}

async function excluirFuncionario(id) {
  if (confirm("Deseja remover este funcionário?")) {
    await supabaseClient.from("perfis").delete().eq("id", id);
    carregarTabelaFuncionarios();
  }
}

function formatarData(dataISO) {
  if (!dataISO) return "";
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}
/* =========================================================
   BLOQUEIO DE INSPEÇÃO E BOTÃO DIREITO (DESATIVADO PARA TESTES)
   ========================================================= */

document.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  if (e.keyCode === 123 || e.key === "F12") e.preventDefault();
  if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67 || e.key === 'I' || e.key === 'J' || e.key === 'C')) e.preventDefault();
  if (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83 || e.key === 'u' || e.key === 's')) e.preventDefault();
});

setInterval(() => {
  const antes = performance.now();
  debugger;
  const depois = performance.now();
  if (depois - antes > 100) window.location.reload();
}, 1000);
