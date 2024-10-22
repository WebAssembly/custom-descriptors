(* Currently, the prose directly borrows some structures of AL.
   Perhaps this should be improved later *)

type cmpop = Eq | Ne | Lt | Gt | Le | Ge
type binop = And | Or | Impl | Equiv

type expr = Al.Ast.expr

type stmt =
| LetS of expr * expr
| CondS of expr
| CmpS of expr * cmpop * expr
| IsValidS of expr option * expr * expr list
| MatchesS of expr * expr
| IsConstS of expr option * expr
| IsDefinedS of expr
| IfS of expr * stmt list
| ForallS of (expr * expr) list * stmt list
| EitherS of stmt list list
| BinS of stmt * binop * stmt
(* TODO: Merge others statements into RelS *)
| RelS of string * expr list
| YetS of string

type def =
| RuleD of Al.Ast.anchor * stmt * stmt list
| AlgoD of Al.Ast.algorithm

type prose = def list
