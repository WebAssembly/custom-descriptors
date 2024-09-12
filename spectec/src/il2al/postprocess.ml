open Al
open Ast
(* open Free *)
(* open Al_util *)
(* open Printf *)
open Util
open Source
(* open Def *)
(* open Il2al_util *)

let rec merge_pop_assert' instrs =
  let rec merge_helper acc = function
    | ({ it = AssertI ({ it = TopValueE None; _ } as e1); _ } as i1) ::
    ({ it = PopI e2; _ } as i2) ::
    ({ it = AssertI ({ it = BinE (EqOp, e31, e32); _ }); _ } as i3) :: il ->
      (match e2.it with
      | CaseE ([{ it = El.Atom.Atom ("CONST" | "VCONST"); _ }]::_ as mixop, hd::tl)
      when Eq.eq_expr e31 hd ->
        let e1 = { e1 with it = TopValueE (Some e32) } in
        let i1 = { i1 with it = AssertI e1 } in
        let e2 = { e2 with it = CaseE (mixop, e32::tl) } in
        let i2 = { i2 with it = PopI e2 } in
        merge_helper (i2 :: i1 :: acc) il
      | _ -> merge_helper (i1 :: acc) (i2 :: i3 :: il)
      )
    | i :: il -> merge_helper (i :: acc) il
    | [] -> List.rev acc
  in
  let instrs = merge_helper [] instrs in
  List.map (fun i ->
    let it =
      match i.it with
      | IfI (e, il1, il2) -> IfI (e, merge_pop_assert' il1, merge_pop_assert' il2)
      | EitherI (il1, il2) -> EitherI (merge_pop_assert' il1, merge_pop_assert' il2)
      | EnterI (e1, e2, il) -> EnterI (e1, e2, merge_pop_assert' il)
      | OtherwiseI (il) -> OtherwiseI (merge_pop_assert' il)
      | instr -> instr
    in
    { i with it }
  ) instrs


let merge_pop_assert algo =
  let it =
    match algo.it with
    | RuleA (name, anchor, args, instrs) ->
      RuleA (name, anchor, args, merge_pop_assert' instrs)
    | FuncA (name, args, instrs) ->
      FuncA (name, args, merge_pop_assert' instrs)
  in
  { algo with it }


let postprocess (al: Al.Ast.algorithm list) : Al.Ast.algorithm list =
  al
  |> List.map Transpile.remove_state
  |> List.map merge_pop_assert
  